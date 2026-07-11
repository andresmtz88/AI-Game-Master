require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MEMORY_DIR = path.join(__dirname, "memory");

function readJsonFile(fileName, fallback) {
  try {
    const filePath = path.join(MEMORY_DIR, fileName);
    const rawData = fs.readFileSync(filePath, "utf8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error(`Could not read ${fileName}:`, error.message);
    return fallback;
  }
}

function writeJsonFile(fileName, data) {
  try {
    const filePath = path.join(MEMORY_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error(`Could not write ${fileName}:`, error.message);
    return false;
  }
}

function createIdFromTitle(title) {
  const base = String(title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

  return `${base}-${Date.now()}`;
}

function extractJson(text) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

function getCampaignMemory() {
  return {
    players: readJsonFile("players.json", { players: [] }),
    campaign: readJsonFile("campaign.json", {}),
    quests: readJsonFile("quests.json", {
      activeQuests: [],
      completedQuests: [],
      archivedQuests: [],
    }),
    npcs: readJsonFile("npcs.json", { npcs: [] }),
    factions: readJsonFile("factions.json", { factions: [] }),
    locations: readJsonFile("locations.json", { locations: [] }),
    worldState: readJsonFile("world-state.json", {
      currentLocation: "",
      currentObjective: "",
      completedObjectives: [],
      majorChoices: [],
      worldConsequences: [],
      sideQuests: [],
      discoveredLocations: [],
      metNPCs: [],
      sessionNotes: [],
    }),
    worldEvents: readJsonFile("world-events.json", { events: [] }),
    campaignHistory: readJsonFile("campaign-history.json", { campaigns: [] }),
  };
}

async function analyzeMemoryUpdate(message, memory, keeperReply = "") {  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a memory extraction system for an AI Game Master.

Analyze the player's action and identify only clear, important memory updates.

Return valid JSON only. No markdown. No commentary.

Use this exact shape:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "",
  "worldConsequence": "",
  "locationUpdate": {
  "name": "",
    "status": "",
    "description": "",
  "relatedNPCs": []
  },
  "worldEvent": {
   "title": "",
    "status": "active",
    "description": ""
  },
  "resolvedWorldEvent": "",
  "escalatedWorldEvent": "",
  "sideQuest": {
    "title": "",
    "status": "active",
    "description": ""
  },
  "archivedWorldEvent": "",
  "npcPersonalQuest": {
  "npcName": "",
  "title": "",
  "status": "active",
  "description": ""
  },
  "completedNpcPersonalQuest": {
  "npcName": "",
  "title": ""
  },
  "npcRelationshipReward": {
  "npcName": "",
  "relationshipToParty": "",
  "disposition": "",
  "note": ""
  },
  "factionUpdate": {
    "factionName": "",
    "reputation": "",
    "note": ""
  },
  "factionQuest": {
    "factionName": "",
    "title": "",
    "status": "",
    "description": ""
  },
  "completedFactionQuest": {
    "factionName": "",
    "title": ""
  },
  "failedFactionQuest": {
    "factionName": "",
    "title": ""
  },
  "factionReputationChange": {
    "factionName": "",
    "direction": "",
    "note": ""
  },
  "npcRelationshipPenalty": {
  "npcName": "",
  "relationshipToParty": "",
  "disposition": "",
  "note": ""
  },
  "completedSideQuest": "",
  "failedSideQuest": "",
  "ignoredSideQuest": "",
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": [
    {
      "npcName": "",
      "knownByPlayers": null,
      "relationshipToParty": "",
      "disposition": "",
      "note": ""
    }
  ]
}

Rules:
- Only fill a field if the player's message clearly implies it.
- If unsure, leave the field as an empty string.
- Add npcUpdates when the player clearly meets, introduces themselves to, speaks with, helps, trusts, threatens, harms, or makes an important agreement with a known NPC.
- If the player introduces themselves to or speaks with an NPC for the first time, set knownByPlayers to true.
- If the interaction is neutral, use relationshipToParty: "acquaintance" and disposition: "neutral".
- Do not invent events.
- Do not record ordinary movement unless a new meaningful location is reached.
- Do not record a major choice unless it could affect the story later.
- Do not complete an objective unless the player's action clearly completes it.
- Use objectiveProgress when the player makes meaningful progress toward the current objective but does not clearly complete it.
- Set advanceAct to true only when the player's actions clearly resolve a major act-level story milestone.
- Do not advance acts for ordinary progress or minor objectives.
- Use the current campaign act and active quest act structure to decide whether advanceAct should be true.
- Use majorChoice whenever the player's decision permanently changes the story, a location, an NPC relationship, a faction, or the future direction of the campaign.
- Destroying an important location is always a majorChoice.
- Use worldConsequence when the player destroys, saves, changes, corrupts, restores, conquers, abandons, seals, opens, or permanently alters a location, settlement, faction, organization, community, or major world feature.
- Destruction of an important location should almost always create a worldConsequence.
- Sealing or unleashing a major threat should almost always create a worldConsequence.
- Do not use worldConsequence for minor actions or ordinary conversation.
- Use sideQuest when an NPC offers a new optional mission, investigation, recovery task, secret objective, or personal request.
- Do not use sideQuest for the main quest.
- Use completedSideQuest when the player clearly completes, finishes, recovers, delivers, solves, or resolves an active side quest.
- completedSideQuest should match the side quest title when possible.
- If the player says they recover, deliver, solve, complete, finish, or return something that matches an active side quest, set completedSideQuest to that side quest title.
- Use failedSideQuest when an active side quest becomes impossible to complete, the target is destroyed, the NPC dies, the item is lost forever, or the opportunity permanently closes.
- Use ignoredSideQuest when the player clearly abandons, refuses, walks away from, or chooses not to pursue an active side quest.
- failedSideQuest and ignoredSideQuest should match the side quest title when possible.
- Use npcPersonalQuest when a known NPC offers a personal mission tied to their backstory, fears, regrets, family, research, redemption, rivalry, duty, or private goals.
- npcPersonalQuest should only be used when the mission is clearly personal to that NPC.
- Do not use npcPersonalQuest for ordinary side quests.
- Use completedNpcPersonalQuest when the player clearly completes, recovers, delivers, solves, or resolves an active NPC personal quest.
- completedNpcPersonalQuest should include the NPC name and personal quest title when possible.
- Use npcRelationshipReward when completing an NPC personal quest would meaningfully improve or worsen that NPC's relationship with the party.
- The reward should reflect emotional impact, trust, gratitude, betrayal, fear, or respect.
- Use npcRelationshipPenalty when the player betrays, abandons, deceives, steals from, threatens, harms, insults, or significantly disappoints a known NPC.
- The penalty should reflect the emotional impact on that NPC.
- Use stronger penalties for close friends and trusted allies who are betrayed.
- When npcRelationshipPenalty is used, disposition should reflect the emotional impact of the betrayal.
- Use worldEvent when the player's actions or faction outcomes create a new ongoing event, threat, opportunity, crisis, retaliation, public reaction, regional change, or world development.
- Do not use worldEvent for small moment-to-moment actions.
- Use resolvedWorldEvent when the player clearly ends, stops, resolves, prevents, or neutralizes an active world event.
- Use escalatedWorldEvent when an active world event worsens, spreads, intensifies, causes damage, or becomes a larger crisis.
- resolvedWorldEvent and escalatedWorldEvent should match the active world event title when possible.
- Use archivedWorldEvent when an existing world event has fully concluded and is no longer an active concern.
- Archived events represent historical events that remain part of world history but should no longer affect current events.
- If an event is already resolved and the player says it is remembered only as history, no longer relevant, passed into memory, or no longer an active concern, use archivedWorldEvent instead of resolvedWorldEvent.
- If the player destroys, damages, restores, corrupts, cleanses, fortifies, abandons, or rebuilds a named location, always fill locationUpdate.
- When a location update clearly involves known NPCs, include their names in locationUpdate.relatedNPCs.
- Only include NPCs who are directly tied to the location change.

Location memory:

Use locationUpdate when a location is discovered, changed, damaged, destroyed, restored, corrupted, cleansed, fortified, abandoned, rebuilt, or otherwise permanently altered.

Possible status examples:
- active
- damaged
- destroyed
- restored
- corrupted
- cleansed
- fortified
- abandoned

Location updates should represent persistent world changes.

When an active world event already exists, prefer resolvedWorldEvent or escalatedWorldEvent instead of creating a new worldEvent.

Only create a new worldEvent if the situation represents a completely new ongoing development.

Example:

Active World Event:
"The Eternal Circle's Retaliation"

Player defeats the retaliation force:
→ resolvedWorldEvent

Player causes the retaliation to spread:
→ escalatedWorldEvent

Do not create a new worldEvent in these cases.

Examples:
- betrayed
- hurt
- disappointed
- resentful
- angry
- distrustful

Avoid using "neutral" for significant relationship penalties.

Faction memory:

Use factionUpdate when the player's actions significantly help, harm, betray, support, oppose, expose, destroy, protect, or influence a known faction.

Possible reputation values:
- allied
- friendly
- neutral
- suspicious
- hostile
- enemy

Faction reputation reflects the faction's opinion of the party.

Faction reputation evolution:

Use factionReputationChange when the player's actions improve or worsen an existing faction relationship.

direction values:
- improve
- worsen

Examples:

Helping a faction:
→ improve

Protecting faction members:
→ improve

Destroying faction assets:
→ worsen

Killing faction leaders:
→ worsen

Exposing faction secrets:
→ worsen

Faction quest chains:

Use factionQuest when a faction offers, creates, assigns, reveals, or triggers a quest tied to that faction's goals.

Faction quests should reflect the faction's reputation toward the party.

Friendly factions often offer assistance, protection, recovery, exploration, or restoration quests.

Hostile or enemy factions may trigger opposition quests, retaliation quests, bounty hunts, sabotage operations, or defensive responses.

Faction quests should create long-term story opportunities.

Faction quest status is evaluated from the faction's perspective.

If the party helps a faction achieve its goal:
→ completedFactionQuest

If the party defeats, prevents, disrupts, stops, sabotages, or destroys a faction's goal:
→ failedFactionQuest

Example:

The Eternal Circle launches Operation Fifth Starfall.

If the party helps recover the stellar shards:
→ completedFactionQuest

If the party prevents recovery of the stellar shards:
→ failedFactionQuest
- completedFactionQuest and failedFactionQuest should include the faction name and quest title when possible.

Example:

Player Action:
"The Constellation Spirit asks us to restore the celestial beacons."

Output:
{
  "factionQuest": {
    "factionName": "Constellation Spirit",
    "title": "Restore the Celestial Beacons",
    "status": "active",
    "description": "Travel across the realm and restore the ancient celestial beacons before the fifth star falls."
  }
}

Example:

Player Action:
"We destroy an Eternal Circle ritual site."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "Destroyed an Eternal Circle ritual site.",
  "worldConsequence": "The Eternal Circle ritual site was destroyed.",
  "sideQuest": {
    "title": "",
    "status": "",
    "description": ""
  },
  "npcPersonalQuest": {
    "npcName": "",
    "title": "",
    "status": "",
    "description": ""
  },
  "completedNpcPersonalQuest": {
    "npcName": "",
    "title": ""
  },
  "npcRelationshipReward": {
    "npcName": "",
    "relationshipToParty": "",
    "disposition": "",
    "note": ""
  },
  "npcRelationshipPenalty": {
    "npcName": "",
    "relationshipToParty": "",
    "disposition": "",
    "note": ""
  },
  "factionUpdate": {
    "factionName": "The Eternal Circle",
    "reputation": "hostile",
    "note": "The party destroyed an Eternal Circle ritual site."
  },
  "completedSideQuest": "",
  "failedSideQuest": "",
  "ignoredSideQuest": "",
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"I destroy the Observatory Tower to stop the ritual from spreading."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "Destroyed the Observatory Tower to stop the ritual from spreading.",
  "worldConsequence": "The Observatory Tower was destroyed to stop the ritual from spreading.",
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"I ask Sera what should be done with the starlight fragment."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "",
  "worldConsequence": "",
  "sideQuest": {
    "title": "The Starlight Fragment",
    "status": "active",
    "description": "Decide what should be done with the starlight fragment."
  },
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"We recover the missing star charts from the ruined cathedral."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "",
  "worldConsequence": "",
  "sideQuest": {
    "title": "",
    "status": "",
    "description": ""
  },
  "completedSideQuest": "Recover the Missing Star Charts",
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"The missing star charts burn before we can recover them."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "",
  "worldConsequence": "",
  "sideQuest": {
    "title": "",
    "status": "",
    "description": ""
  },
  "completedSideQuest": "",
  "failedSideQuest": "Recover the Missing Star Charts",
  "ignoredSideQuest": "",
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"We abandon the search for the missing star charts."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "",
  "worldConsequence": "",
  "sideQuest": {
    "title": "",
    "status": "",
    "description": ""
  },
  "completedSideQuest": "",
  "failedSideQuest": "",
  "ignoredSideQuest": "Recover the Missing Star Charts",
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"We recover Aldrin Starweaver's lost journal and return it to Sera."

Output:
{
  "newLocation": "",
  "newObjective": "",
  "completedObjective": "",
  "majorChoice": "",
  "worldConsequence": "",
  "sideQuest": {
    "title": "",
    "status": "",
    "description": ""
  },
  "npcPersonalQuest": {
    "npcName": "",
    "title": "",
    "status": "",
    "description": ""
  },
  "completedNpcPersonalQuest": {
    "npcName": "Sera Brightwind",
    "title": "Recover Aldrin Starweaver's Lost Journal"
  },
  "npcRelationshipReward": {
    "npcName": "Sera Brightwind",
    "relationshipToParty": "close friend",
    "disposition": "deeply grateful",
    "note": "The party recovered Aldrin Starweaver's lost journal and returned it to Sera."
  },
  "objectiveProgress": "",
  "advanceAct": false,
  "npcUpdates": []
}

Example:

Player Action:
"We keep Aldrin's journal and refuse to return it to Sera."

Output:
{
  "npcRelationshipPenalty": {
    "npcName": "Sera Brightwind",
    "relationshipToParty": "wary",
    "disposition": "betrayed",
    "note": "The party refused to return Aldrin Starweaver's journal."
  }
}

Example:

Player Action:
"We secretly help the Eternal Circle recover a stolen relic."

Output:
{
  "factionReputationChange": {
    "factionName": "The Eternal Circle",
    "direction": "improve",
    "note": "The party helped recover a stolen relic."
  }
}

Example:

Player Action:
"We stop Operation Fifth Starfall and prevent the Eternal Circle from recovering the shards."

Output:
{
  "failedFactionQuest": {
    "factionName": "The Eternal Circle",
    "title": "Operation Fifth Starfall"
  }
}

Example:

Player Action:
"We defeat the Eternal Circle retaliation force before they can strike Millhaven."

Output:
{
  "resolvedWorldEvent": "The Eternal Circle's Retaliation"
}

Example:

Player Action:
"The Eternal Circle retaliation spreads beyond Millhaven and attacks nearby villages."

Output:
{
  "escalatedWorldEvent": "The Eternal Circle's Retaliation"
}

Example:

Player Action:
"Months later, the Eternal Circle's Retaliation is remembered only as a historical event."

Output:
{
  "archivedWorldEvent": "The Eternal Circle's Retaliation"
}

Example:

Player Action:
"Months later, The Eternal Circle's Retaliation is remembered only as a historical event."

Output:
{
  "worldEvent": {
    "title": "",
    "status": "",
    "description": ""
  },
  "resolvedWorldEvent": "",
  "escalatedWorldEvent": "",
  "archivedWorldEvent": "The Eternal Circle's Retaliation"
}

Example:

Player Action:
"We destroy the Observatory Tower to stop the ritual."

Output:
{
  "locationUpdate": {
    "name": "Observatory Tower",
    "status": "destroyed",
    "description": "The Observatory Tower was destroyed to stop the ritual."
  }
}

Example:

Player Action:
"We restore Sera Brightwind's Observatory Tower using celestial magic."

Output:
{
  "locationUpdate": {
    "name": "Observatory Tower",
    "status": "restored",
    "description": "The Observatory Tower was restored using celestial magic.",
    "relatedNPCs": ["Sera Brightwind"]
  }
}

Known NPCs:
${JSON.stringify(memory.npcs, null, 2)}

Current World State:
${JSON.stringify(memory.worldState, null, 2)}

Active Side Quests:
${JSON.stringify(memory.worldState.sideQuests || [], null, 2)}

Current Campaign:
${JSON.stringify(memory.campaign, null, 2)}

Active Quests:
${JSON.stringify(memory.quests, null, 2)}

Player Action:
${message}

Keeper Reply:
${keeperReply}`
        }
      ]
    });

    return extractJson(response.content[0].text);
  } catch (error) {
    console.error("Memory analysis failed:", error.message);
    return null;
  }
}

function evolveNpcRelationship(currentRelationship, currentDisposition, update) {
  const relationship = String(currentRelationship || "not yet met").toLowerCase();
  const disposition = String(currentDisposition || "unknown").toLowerCase();

  const updateRelationship = String(update.relationshipToParty || "").toLowerCase();
  const updateDisposition = String(update.disposition || "").toLowerCase();
  const note = String(update.note || "").toLowerCase();

  const positiveWords = [
    "help",
    "helped",
    "aid",
    "aided",
    "trust",
    "trusted",
    "protect",
    "protected",
    "save",
    "saved",
    "agree",
    "agreed",
    "support",
    "supported",
    "ally",
    "friendly"
  ];

  const negativeWords = [
    "threaten",
    "threatened",
    "attack",
    "attacked",
    "harm",
    "harmed",
    "betray",
    "betrayed",
    "lie",
    "lied",
    "steal",
    "stole",
    "hostile",
    "suspicious"
  ];

  const positiveSignal =
    positiveWords.some((word) => note.includes(word)) ||
    positiveWords.some((word) => updateRelationship.includes(word)) ||
    positiveWords.some((word) => updateDisposition.includes(word));

  const negativeSignal =
    negativeWords.some((word) => note.includes(word)) ||
    negativeWords.some((word) => updateRelationship.includes(word)) ||
    negativeWords.some((word) => updateDisposition.includes(word));

  const positivePath = [
    "not yet met",
    "acquaintance",
    "friendly",
    "ally",
    "trusted ally"
  ];

  const negativePath = [
    "neutral",
    "suspicious",
    "hostile"
  ];

  let nextRelationship = relationship;
  let nextDisposition = disposition;

  if (negativeSignal) {
    const currentIndex = negativePath.indexOf(disposition);
    nextDisposition = negativePath[Math.min(currentIndex + 1, negativePath.length - 1)] || "suspicious";

    if (nextDisposition === "hostile") {
      nextRelationship = "enemy";
    }

    return {
      relationshipToParty: nextRelationship,
      disposition: nextDisposition
    };
  }

  if (positiveSignal) {
    const currentIndex = positivePath.indexOf(relationship);
    nextRelationship = positivePath[Math.min(currentIndex + 1, positivePath.length - 1)] || "friendly";

    return {
      relationshipToParty: nextRelationship,
      disposition: "friendly"
    };
  }

  if (updateRelationship || updateDisposition) {
    return {
      relationshipToParty: update.relationshipToParty || currentRelationship,
      disposition: update.disposition || currentDisposition
    };
  }

  return {
    relationshipToParty: currentRelationship,
    disposition: currentDisposition
  };
}

function getNpcDialogueContext(npcs) {
  const npcList = npcs.npcs || [];

  if (!npcList.length) {
    return "No NPC relationship history is currently recorded.";
  }

  return npcList
    .map((npc) => {
      const history = npc.relationshipHistory?.length
        ? npc.relationshipHistory.slice(-5).map((item) => `- ${item}`).join("\n")
        : "No relationship history recorded.";

      return `${npc.name}
Role: ${npc.role || "Unknown"}
Relationship: ${npc.relationshipToParty || "unknown"}
Disposition: ${npc.disposition || "unknown"}
Known by players: ${npc.knownByPlayers ? "Yes" : "No"}
Recent relationship history:
${history}`;
    })
    .join("\n\n");
}

function getNpcOpportunityContext(npcs) {
  const npcList = npcs.npcs || [];

  if (!npcList.length) {
    return "No NPC opportunity context is currently recorded.";
  }

  return npcList
    .map((npc) => {
      let opportunityLevel = "none";

      const relationship = String(npc.relationshipToParty || "").toLowerCase();
      const disposition = String(npc.disposition || "").toLowerCase();

      if (
        relationship.includes("trusted ally") ||
        relationship.includes("ally")
      ) {
        opportunityLevel = "high";
      } else if (
        relationship.includes("friendly") ||
        disposition.includes("friendly")
      ) {
        opportunityLevel = "medium";
      } else if (
        disposition.includes("hostile") ||
        relationship.includes("enemy")
      ) {
        opportunityLevel = "restricted";
      }

      return `${npc.name}
Opportunity Level: ${opportunityLevel}`;
    })
    .join("\n");
}

function getNextFactionReputation(
  currentReputation,
  direction
) {
  const ladder = [
    "enemy",
    "hostile",
    "suspicious",
    "neutral",
    "friendly",
    "allied",
  ];

  const currentIndex = ladder.indexOf(
    currentReputation || "neutral"
  );

  if (currentIndex === -1) {
    return "neutral";
  }

  if (direction === "improve") {
    return ladder[
      Math.min(currentIndex + 1, ladder.length - 1)
    ];
  }

  if (direction === "worsen") {
    return ladder[
      Math.max(currentIndex - 1, 0)
    ];
  }

  return currentReputation;
}

function getFactionContext(factions) {
  const factionList = factions.factions || [];

  if (!factionList.length) {
    return "No faction memory is currently recorded.";
  }

  return factionList
    .map((faction) => {
      const history = faction.history?.length
        ? faction.history.slice(-5).map((item) => `- ${item}`).join("\n")
        : "No faction history recorded.";

      return `${faction.name}
Reputation: ${faction.reputation || "neutral"}
Recent faction history:
${history}`;
    })
    .join("\n\n");
}

function getActiveQuest(quests, campaign) {
  const activeQuests = quests.activeQuests || [];

  if (!activeQuests.length) return null;

  if (campaign.activeQuestId) {
    const matchingQuest = activeQuests.find((quest) => quest.id === campaign.activeQuestId);
    if (matchingQuest) return matchingQuest;
  }

  return activeQuests[activeQuests.length - 1];
}

function saveGeneratedCampaign(campaignRecord) {
  const campaignHistory = readJsonFile("campaign-history.json", { campaigns: [] });
  const campaign = readJsonFile("campaign.json", {});
  const quests = readJsonFile("quests.json", {
    activeQuests: [],
    completedQuests: [],
    archivedQuests: [],
  });
  const npcs = readJsonFile("npcs.json", { npcs: [] });
  const worldState = readJsonFile("world-state.json", {
     currentLocation: "",
     currentObjective: "",
     completedObjectives: [],
     majorChoices: [],
     worldConsequences: [],
     sideQuests: [],
     discoveredLocations: [],
     metNPCs: [],
     sessionNotes: [],
  });

  const campaignId = createIdFromTitle(campaignRecord.campaignName || "untitled-campaign");
  const questId = createIdFromTitle(campaignRecord.mainQuestTitle || "untitled-main-quest");
  const savedAt = new Date().toISOString();

  const fullCampaignRecord = {
    id: campaignId,
    savedAt,
    ...campaignRecord,
  };

  campaignHistory.campaigns.push(fullCampaignRecord);

  const updatedCampaign = {
    ...campaign,
    id: campaignId,
    campaignName: campaignRecord.campaignName || "Untitled Campaign",
    status: "active",
    activeQuestId: questId,
    theme: campaignRecord.theme || null,
    tone: campaignRecord.tone || "balanced heroic fantasy with realistic consequences",
    questLength: campaignRecord.questLength || null,
    currentAct: campaignRecord.currentAct || 1,
    summary: campaignRecord.campaignPremise || "",
    lastUpdated: savedAt,
  };

  const mainQuest = {
    id: questId,
    campaignId,
    campaignName: campaignRecord.campaignName || "Untitled Campaign",
    title: campaignRecord.mainQuestTitle || "Untitled Main Quest",
    type: "main",
    status: "active",
    questLength: campaignRecord.questLength || null,
    theme: campaignRecord.theme || null,
    tone: campaignRecord.tone || null,
    difficulty: campaignRecord.difficulty || null,
    playerExperienceLevel: campaignRecord.playerExperienceLevel || null,
    premise: campaignRecord.campaignPremise || "",
    mainConflict: campaignRecord.mainConflict || "",
    primaryThreat: campaignRecord.primaryVillainOrThreat || "",
    startingLocation: campaignRecord.importantStartingLocation || "",
    importantNPCs: campaignRecord.importantNPCs || [],
    acts: campaignRecord.actStructure || [],
    openingScene: campaignRecord.openingScene || "",
    firstPlayerChoice: campaignRecord.firstPlayerChoice || "",
    createdAt: savedAt,
    updatedAt: savedAt,
  };

  const oldActiveQuests = quests.activeQuests || [];
  const archivedOldQuests = oldActiveQuests.map((quest) => ({
    ...quest,
    status: "archived",
    archivedAt: savedAt,
  }));

  quests.archivedQuests = [...(quests.archivedQuests || []), ...archivedOldQuests];
  quests.activeQuests = [mainQuest];

  const generatedNPCs = (campaignRecord.importantNPCs || []).map((npc) => {
    return {
      id: createIdFromTitle(npc.name || "unnamed-npc"),
      name: npc.name || "Unnamed NPC",
      role: npc.role || "Unknown role",
      description: npc.description || "",
      campaignId,
      campaignName: campaignRecord.campaignName || "Untitled Campaign",
      questId,
      questTitle: campaignRecord.mainQuestTitle || "Untitled Main Quest",
      status: "active",
      disposition: "unknown",
      relationshipToParty: "not yet met",
      knownByPlayers: false,
      currentLocation: campaignRecord.importantStartingLocation || null,
      notes: [],
      relationshipHistory: [],
      faction: "",
      personalQuests: [],
      createdAt: savedAt,
      updatedAt: savedAt,
    };
  });

  npcs.npcs.push(...generatedNPCs);

  const updatedWorldState = {
  ...worldState,

  currentLocation:
    campaignRecord.importantStartingLocation ||
    worldState.currentLocation ||
    "",

  currentObjective:
    `Begin the main quest: ${
      campaignRecord.mainQuestTitle || "Untitled Main Quest"
    }`,

  discoveredLocations: [
    ...new Set([
      ...(worldState.discoveredLocations || []),
      campaignRecord.importantStartingLocation || ""
    ].filter(Boolean))
  ],

  sessionNotes: [
    ...(worldState.sessionNotes || []),
    `Campaign "${campaignRecord.campaignName || "Untitled Campaign"}" created at ${savedAt}.`
  ]
};

writeJsonFile("campaign-history.json", campaignHistory);
writeJsonFile("campaign.json", updatedCampaign);
writeJsonFile("quests.json", quests);
writeJsonFile("npcs.json", npcs);
writeJsonFile("world-state.json", updatedWorldState);

  return { campaignId, questId };
}

app.get("/", (req, res) => {
  res.send("AI Game Master backend is running.");
});

app.post("/gm-message", async (req, res) => {
  console.log("GM MESSAGE ROUTE HIT");
  try {
    const { playerName, message, command } = req.body;

    console.log("COMMAND RECEIVED:", command);
    console.log("MESSAGE RECEIVED:", message);

    if (
      !message &&
      command !== "/begin" &&
      command !== "/quest" &&
      command !== "/campaign" &&
      command !== "/location" &&
      command !== "/objective" &&
      command !== "/choice"
    ) {

      return res.status(400).json({
        error: "Message is required.",
      });
    }

    const memory = getCampaignMemory();

    if (command === "/choice") {
      if (!message) {
        return res.json({
          reply: `Use /choice to record a major story decision.

    Examples:
    /choice Trusted Sera Brightwind with the celestial map
    /choice Destroyed the ancient telescope`
        });
      }

      const worldState = readJsonFile("world-state.json", {
        currentLocation: "",
        currentObjective: "",
        completedObjectives: [],
        majorChoices: [],
        worldConsequences: [],
        sideQuests: [],
        discoveredLocations: [],
        metNPCs: [],
        sessionNotes: [],
      });

      const choiceText = message.trim();

      const updatedWorldState = {
        ...worldState,
        majorChoices: [
          ...new Set([
            ...(worldState.majorChoices || []),
            choiceText
          ].filter(Boolean))
        ],
        sessionNotes: [
         ...(worldState.sessionNotes || []),
          `Major choice recorded: ${choiceText}`
        ]
      };

      writeJsonFile("world-state.json", updatedWorldState);

      return res.json({
        reply: `Major choice recorded:

    ${choiceText}`
      });
    }

    if (command === "/objective") {
      if (!message) {
        return res.json({
          reply: `Use /objective to update the current objective.

    Examples:
    /objective Investigate the strange telescope
    /objective complete Reach Observatory Tower`
        });
      }

      const worldState = readJsonFile("world-state.json", {
        currentLocation: "",
        currentObjective: "",
        completedObjectives: [],
        majorChoices: [],
        worldConsequences: [],
        sideQuests: [],
        discoveredLocations: [],
        metNPCs: [],
        sessionNotes: [],
      });

      const isComplete = message.toLowerCase().startsWith("complete ");
      const objectiveText = isComplete
        ? message.replace(/^complete\s+/i, "").trim()
        : message.trim();

      const updatedWorldState = {
        ...worldState,
        currentObjective: isComplete ? "" : objectiveText,

        completedObjectives: isComplete
          ? [
              ...new Set([
                ...(worldState.completedObjectives || []),
                objectiveText
              ].filter(Boolean))
            ]
          : worldState.completedObjectives || [],

        sessionNotes: [
          ...(worldState.sessionNotes || []),
          isComplete
            ? `Completed objective: ${objectiveText}`
            : `Current objective set: ${objectiveText}`
        ]
      };

      writeJsonFile("world-state.json", updatedWorldState);

      return res.json({
        reply: isComplete
          ? `Objective completed:

    ${objectiveText}`
          : `Current objective updated:

    ${objectiveText}`
      });
    }

    if (command === "/location") {
      
     if (!message) {
       return res.json({
         reply: `Use /location to record a discovered location.

   Example:
   /location Discover Observatory Tower`
       });
     }

     const worldState = readJsonFile("world-state.json", {
       currentLocation: "",
       currentObjective: "",
       completedObjectives: [],
       majorChoices: [],
       worldConsequences: [],
       sideQuests: [],
       discoveredLocations: [],
       metNPCs: [],
       sessionNotes: [],
     });

     const locationResponse = await anthropic.messages.create({
       model: "claude-sonnet-4-5",
       max_tokens: 400,
       messages: [
         {
           role: "user",
           content: `Extract a location memory update from the player's message.

   Return valid JSON only. No markdown. No commentary.

   Use this exact shape:
   {
     "locationName": "",
     "setAsCurrentLocation": true,
     "note": ""
   }

   Player message:
   ${message}`
         }
       ]
     });

     let locationUpdate;

     try {
       locationUpdate = extractJson(locationResponse.content[0].text);
     } catch (error) {
       return res.json({
         reply: "I could not understand the location update. Try: /location Discover Observatory Tower"
       });
     }

     const locationName = locationUpdate.locationName || message.replace(/^discover/i, "").trim();

     const updatedDiscoveredLocations = [
       ...new Set([
         ...(worldState.discoveredLocations || []),
         locationName
       ].filter(Boolean))
     ];

     const updatedWorldState = {
       ...worldState,
       currentLocation: locationUpdate.setAsCurrentLocation
         ? locationName
         : worldState.currentLocation,
       discoveredLocations: updatedDiscoveredLocations,
       sessionNotes: [
         ...(worldState.sessionNotes || []),
         locationUpdate.note || `Discovered location: ${locationName}`
       ]
     };

     writeJsonFile("world-state.json", updatedWorldState);

     return res.json({
       reply: `Location memory updated.

   Discovered Location:
   ${locationName}

   Current Location:
   ${updatedWorldState.currentLocation || "Not established."}`
     });
   }

    if (command === "/campaign") {
      const activeQuest = getActiveQuest(memory.quests, memory.campaign);

      if (!activeQuest) {
        return res.json({
          reply: "No active campaign is currently loaded. Create one with /quest.",
        });
      }

      const relatedNPCs = (memory.npcs.npcs || []).filter((npc) => {
        return npc.questId === activeQuest.id;
      });

      const npcList = relatedNPCs.length
         ? relatedNPCs
             .map((npc) => {
               return `- ${npc.name}: ${npc.role}
         Relationship: ${npc.relationshipToParty || "unknown"}
         Disposition: ${npc.disposition || "unknown"}
         Known: ${npc.knownByPlayers ? "Yes" : "No"}`;
            })
             .join("\n")
         : "No known NPCs recorded yet.";

      const majorChoices = memory.worldState.majorChoices?.length
        ? memory.worldState.majorChoices.map((choice) => `- ${choice}`).join("\n")
        : "No major choices recorded yet.";

      const discoveredLocations = memory.worldState.discoveredLocations?.length
        ? memory.worldState.discoveredLocations.map((location) => `- ${location}`).join("\n")
        : "No discovered locations recorded yet.";

      const locationMemory = memory.locations.locations?.length
        ? memory.locations.locations
            .map((location) => {
              return `${location.name || "Unknown Location"}
      Status: ${location.status || "unknown"}
      ${location.description || "No description recorded."}`;
            })
            .join("\n\n")
        : "No detailed location memory recorded yet.";
      
      const worldConsequences = memory.worldState.worldConsequences?.length
        ? memory.worldState.worldConsequences.map((item) => `- ${item}`).join("\n")
        : "No world consequences recorded yet.";

      const sideQuests = memory.worldState.sideQuests?.length
        ? memory.worldState.sideQuests
            .map((quest) => {
              if (typeof quest === "string") {
                return `- ${quest}`;
              }

              return `- ${quest.title || "Untitled Side Quest"} [${quest.status || "active"}]
        ${quest.description || "No description recorded."}`;
            })
            .join("\n")
        : "No side quests recorded yet.";

      const factionQuests = memory.factions.factions?.length
        ? memory.factions.factions
            .map((faction) => {
              const quests = faction.questChains?.length
                ? faction.questChains
                    .map((quest) => {
                      return `- ${quest.title || "Untitled Faction Quest"} [${quest.status || "active"}]
        ${quest.description || "No description recorded."}`;
                    })
                    .join("\n")
                : "No faction quests recorded.";

              return `${faction.name}
      Reputation: ${faction.reputation || "neutral"}
      ${quests}`;
            })
            .join("\n\n")
        : "No faction quests recorded yet.";

      const activeWorldEvents =
        memory.worldEvents.events?.filter((event) => {
          return event.status !== "archived";
        }) || [];

      const worldEvents = activeWorldEvents.length
        ? activeWorldEvents
            .map((event) => {
              return `- ${event.title || "Untitled World Event"} [${event.status || "active"}]
        ${event.description || "No description recorded."}`;
            })
            .join("\n")
        : "No world events recorded yet.";  

      const currentActNumber = memory.campaign.currentAct || 1;

      const currentActTitle =
        activeQuest.acts?.find((act) => act.act === currentActNumber)?.title || "Unknown";

      const campaignResponse = `
      <div>
        <h2>Campaign Journal</h2>

        <p><strong>Campaign:</strong><br>
        ${memory.campaign.campaignName || activeQuest.campaignName || "Untitled Campaign"}</p>

        <p><strong>Main Quest:</strong><br>
        ${activeQuest.title}</p>

        <p><strong>Status:</strong><br>
        ${(memory.campaign.status || "Unknown").replace(/\b\w/g, c => c.toUpperCase())}</p>

        <p><strong>Current Act:</strong><br>
        Act ${currentActNumber}: ${currentActTitle}</p>

        <p><strong>Theme:</strong><br>
        ${(memory.campaign.theme || activeQuest.theme || "Unknown").replace(/\b\w/g, c => c.toUpperCase())}</p>

        <p><strong>Tone:</strong><br>
        ${(memory.campaign.tone || activeQuest.tone || "Unknown").replace(/\b\w/g, c => c.toUpperCase())}</p>

        <p><strong>Difficulty:</strong><br>
        ${(activeQuest.difficulty || "Unknown").replace(/\b\w/g, c => c.toUpperCase())}</p>

        <hr>

        <p><strong>Summary:</strong><br>
        ${memory.campaign.summary || activeQuest.premise || "No summary recorded."}</p>

        <hr>

        <p><strong>Known NPCs:</strong><br>
        ${npcList.replace(/\n/g, "<br>")}</p>

        <p><strong>Current Location:</strong><br>
        ${memory.worldState.currentLocation || "Not established yet."}</p>

        <p><strong>Current Objective:</strong><br>
        ${memory.worldState.currentObjective || "No current objective recorded."}</p>

        <p><strong>Major Choices:</strong><br>
        ${majorChoices.replace(/\n/g, "<br>")}</p>

        <p><strong>World Consequences:</strong><br>
        ${worldConsequences.replace(/\n/g, "<br>")}</p>

        <p><strong>Side Quests:</strong><br>
        ${sideQuests.replace(/\n/g, "<br>")}</p>

        <p><strong>Faction Quests:</strong><br>
        ${factionQuests.replace(/\n/g, "<br>")}</p>

        <p><strong>World Events:</strong><br>
        ${worldEvents.replace(/\n/g, "<br>")}</p>

        <p><strong>Location Memory:</strong><br>
        ${locationMemory.replace(/\n/g, "<br>")}</p>

        <p><strong>Discovered Locations:</strong><br>
        ${discoveredLocations.replace(/\n/g, "<br>")}</p>
      </div>`;

      return res.json({
        reply: campaignResponse,
      });
    }

    if (command === "/npc") {
  const npcs = readJsonFile("npcs.json", { npcs: [] });

  const npcResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `Extract an NPC memory update from the player's message.

  Return valid JSON only. No markdown. No commentary.

  Use this exact shape:
  {
    "npcName": "",
    "knownByPlayers": true,
    "relationshipToParty": "",
    "disposition": "",
    "currentLocation": "",
    "note": ""
  }

  Known NPCs:
  ${JSON.stringify(npcs, null, 2)}

  Player message:
  ${message}`
        }
      ]
    });

    let npcUpdate;

    try {
      npcUpdate = extractJson(npcResponse.content[0].text);
    } catch (error) {
      return res.json({
        reply: "I could not understand the NPC update. Try: /npc Mark Sera Brightwind as met and friendly. Note: She asked us to investigate the vanished stars."
      });
    }

    const npcNameLower = npcUpdate.npcName.toLowerCase();

    const npc = npcs.npcs.find((entry) => {
      return entry.name.toLowerCase() === npcNameLower;
    });

    if (!npc) {
      const knownNpcNames = npcs.npcs.map((entry) => `- ${entry.name}`).join("\n");

      return res.json({
        reply: `I could not find an NPC named "${npcUpdate.npcName}".\n\nKnown NPCs:\n${knownNpcNames || "No NPCs recorded yet."}`
      });
    }

    npc.knownByPlayers = npcUpdate.knownByPlayers ?? npc.knownByPlayers;
    npc.relationshipToParty = npcUpdate.relationshipToParty || npc.relationshipToParty;
    npc.disposition = npcUpdate.disposition || npc.disposition;
    npc.currentLocation = npcUpdate.currentLocation || npc.currentLocation;
    npc.updatedAt = new Date().toISOString();

    if (npcUpdate.note) {
      npc.notes = npc.notes || [];
      npc.notes.push(npcUpdate.note);
    }

    writeJsonFile("npcs.json", npcs);

    return res.json({
      reply: `NPC memory updated.

  ${npc.name}
  Relationship: ${npc.relationshipToParty}
  Disposition: ${npc.disposition}
  Known by players: ${npc.knownByPlayers ? "Yes" : "No"}

  Latest note:
  ${npcUpdate.note || "No note added."}`
    });
  }

    if (command === "/begin") {
      const activeQuest = getActiveQuest(memory.quests, memory.campaign);

      if (!activeQuest) {
        return res.json({
          reply: "No active campaign exists. Create one first using /quest.",
        });
      }

      const relatedNPCs = (memory.npcs.npcs || []).filter((npc) => {
        return npc.questId === activeQuest.id;
      });

      const questNPCs = activeQuest.importantNPCs || [];
      const npcSource = relatedNPCs.length ? relatedNPCs : questNPCs;

      const npcList = npcSource.length
        ? npcSource.map((npc) => `- ${npc.name}: ${npc.role}`).join("\n")
        : "No important NPCs have been recorded yet.";
      
      console.log("CAMPAIGN STATUS:", memory.campaign.status);

      console.log("CAMPAIGN STATUS =", memory.campaign.status);
      console.log("CAMPAIGN COMPLETED =", memory.campaign.status === "completed");

      const campaignCompleted =
        memory.campaign.status === "completed";

      const beginResponse = `The Keeper opens the Chronicle of Realms...

Campaign: ${memory.campaign.campaignName || activeQuest.campaignName || "Untitled Campaign"}
Main Quest: ${activeQuest.title}

Act ${memory.campaign.currentAct || 1}: ${
  activeQuest.acts?.find(
    act => act.act === (memory.campaign.currentAct || 1)
  )?.title || "Unknown"
}

Opening Scene:
${activeQuest.openingScene}

Important NPCs currently tied to this quest:
${npcList}

First Choice:
${activeQuest.firstPlayerChoice}

${
  campaignCompleted
    ? `The main quest of this campaign has been completed.

The world remains alive beyond the final chapter. Old allies still walk the roads, mysteries remain unsolved, and new adventures may yet emerge.

Would you like to:

1. Continue exploring this world
2. Start a new campaign with /quest

What do you do?`
    : `What do you do?

Would you like to continue this campaign, or start a new one with /quest?`
}`;
      return res.json({
        reply: beginResponse,
      });
    }

    if (command === "/quest") {
      if (!message) {
        return res.json({
          reply: `Before I weave a new main quest, answer these setup questions:

1. Quest length:
- Short: 3 acts
- Medium: 4 acts
- Long: 5 acts

2. Theme:
Examples: classic fantasy, mystery, horror, survival, political intrigue, space fantasy, dungeon crawl.

3. Tone:
Examples: heroic, gritty, whimsical, dark, balanced.

4. Difficulty:
Beginner, standard, challenging, or brutal.

5. Player experience level:
New players, mixed group, or experienced players.

You may answer in one message like this:

/quest Create a medium 4-act main quest. Theme: classic fantasy mystery. Tone: heroic but with realistic consequences. Difficulty: standard. Player experience: beginner.`
        });
      }

      const questResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: `You are the Keeper of the Infinite Realms.

Create a structured main quest only if the player has provided enough information.

Required information:
- Quest length: short 3 acts, medium 4 acts, or long 5 acts
- Theme
- Tone
- Difficulty
- Player experience level

If information is missing, ask for the missing details and do not create a campaign record.

If information is provided, generate a valid JSON object only.
Do not include markdown.
Do not wrap the JSON in code fences.
Do not include commentary before or after the JSON.
Keep descriptions concise enough that the full JSON completes.

Use this exact JSON shape:
{
  "readyToSave": true,
  "campaignName": "",
  "mainQuestTitle": "",
  "questLength": "",
  "theme": "",
  "tone": "",
  "difficulty": "",
  "playerExperienceLevel": "",
  "currentAct": 1,
  "campaignPremise": "",
  "mainConflict": "",
  "primaryVillainOrThreat": "",
  "importantStartingLocation": "",
  "importantNPCs": [
    {
      "name": "",
      "role": "",
      "description": ""
    }
  ],
  "actStructure": [
    {
      "act": 1,
      "title": "",
      "summary": ""
    }
  ],
  "openingScene": "",
  "firstPlayerChoice": ""
}

If missing details, use this JSON shape:
{
  "readyToSave": false,
  "missingDetails": [],
  "messageToPlayer": ""
}

Legal safety:
- Generate only original fantasy content.
- Do not use official settings, named characters, protected monsters, product identity creatures, official adventure text, logos, or branded terms.
- Use 5e SRD-compatible fantasy assumptions only.

Player request:
${message}`,
          },
        ],
      });

      const rawQuestText = questResponse.content[0].text;

      console.log("RAW QUEST RESPONSE:");
      console.log(rawQuestText);

      let questData;

      try {
        questData = extractJson(rawQuestText);
      } catch (error) {
        return res.status(500).json({
          error: "Keeper generated invalid quest JSON.",
          details: rawQuestText,
        });
      }

      if (!questData.readyToSave) {
        return res.json({
          reply: questData.messageToPlayer || "I need more details before creating this quest.",
        });
      }

      const saveResult = saveGeneratedCampaign(questData);

      const playerFacingResponse = `The threads of fate have been woven.

Campaign Name: ${questData.campaignName}

Main Quest: ${questData.mainQuestTitle}

Length: ${questData.questLength}
Theme: ${questData.theme}
Tone: ${questData.tone}
Difficulty: ${questData.difficulty}
Player Experience: ${questData.playerExperienceLevel}

Premise:
${questData.campaignPremise}

Main Conflict:
${questData.mainConflict}

Primary Threat:
${questData.primaryVillainOrThreat}

Starting Location:
${questData.importantStartingLocation}

Opening Scene:
${questData.openingScene}

First Choice:
${questData.firstPlayerChoice}

Saved to memory:
Campaign ID: ${saveResult.campaignId}
Quest ID: ${saveResult.questId}`;

      return res.json({ reply: playerFacingResponse });
    }

    console.log("ABOUT TO CALL MAIN KEEPER RESPONSE");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content: `You are the Keeper of the Infinite Realms, a wise, ancient, and immersive AI Game Master for original fantasy tabletop roleplaying games using 5e SRD-compatible rules.

Core identity:
- You are not a generic chatbot.
- You are the Keeper of the Infinite Realms.
- Your tone is classic fantasy: wise, patient, mysterious, and grounded.
- You may feel like an old sage, but do not imitate or reference any copyrighted characters.
- You guide the story, portray NPCs, describe locations, manage danger, and help players understand options.

Legal/content safety rules:
- Use only original fantasy content or 5e SRD-compatible generic mechanics.
- Do not use official Dungeons & Dragons branding in narration.
- Do not mention or generate protected campaign settings, named characters, adventure text, logos, or product names.
- Do not use protected iconic non-SRD creatures or official product identity monsters.
- Do not copy text from official books or adventures.
- Refer to the system as "5e SRD-compatible fantasy rules" when needed.

Language support:
- Respond in the same language the player uses.
- If the player asks to switch languages, acknowledge briefly and continue in that language.
- Do not treat language changes as in-character roleplay.
- Keep the Keeper's classic fantasy tone in every language.
- Keep command words such as /gm, /hint, /quest, /rules, /lore, and /ooc in English for now.

Narration style:
- Use medium-length responses by default.
- Be immersive and sensory, but not excessive.
- Avoid markdown headings unless truly helpful.
- End most scene responses with a clear prompt such as: "What do you do?"

Player agency:
- Never control a player character's choices, thoughts, speech, or emotions.
- You may suggest possible actions when helpful.
- You may warn players when an action has obvious tactical danger.
- Let players make the final decision.

Hints:
- Hints are adaptive and should guide without solving everything.
- Each player has 3 personal hint charges, not shared with the party.
- Hint recharge timing is handled by the Foundry module.

Command behavior:
- /gm means normal in-world narration and gameplay.
- /hint means provide an adaptive hint.
- /rules means answer as a clear 5e SRD-compatible rules assistant.
- /lore means answer worldbuilding, setting, history, faction, location, or NPC questions without revealing hidden secrets too easily.
- /ooc means answer out-of-character player guidance questions clearly and helpfully.

Campaign memory:
Use this memory as context, but do not reveal hidden information unless appropriate.

NPC dialogue memory:
When portraying an NPC, use their relationshipToParty, disposition, knownByPlayers, and relationshipHistory to shape tone and dialogue.
If an NPC is friendly, allied, or trusted, they may reference past help, promises, protection, shared risks, or important memories.
If an NPC is suspicious, hostile, or betrayed, they may reference past threats, harm, lies, or broken trust.
Do not invent relationship history. Only reference events present in memory.

NPC recognition and greetings:
When the player approaches, greets, speaks to, questions, or returns to a known NPC, begin the NPC interaction with recognition appropriate to their relationship.
- trusted ally: warm recognition, relief, familiarity, or emotional honesty
- ally: respectful and cooperative recognition
- friendly: pleasant and open recognition
- acquaintance: polite but reserved recognition
- suspicious: guarded recognition
- hostile or enemy: tense or confrontational recognition
If knownByPlayers is false, treat the interaction as a first meeting.
Do not overdo greetings; keep them natural and grounded in the scene.

Relationship-based opportunities:

NPCs with high opportunity level may:
- reveal hidden information
- offer personal quests
- share secrets
- grant access to restricted locations
- ask for help with private matters

NPCs with medium opportunity level may:
- offer rumors
- provide useful clues
- share limited information

NPCs with restricted opportunity level should normally withhold secrets, personal information, evidence, quest hooks, and hidden knowledge.

- refuse assistance
- conceal information
- deny knowledge
- require persuasion or proof before cooperating

Do not reveal major secrets, confessions, evidence, or hidden quest opportunities to restricted opportunity NPCs unless there is a compelling story reason.

Do not force opportunities into every conversation.
Offer them naturally when appropriate.

Relationship-based NPC behavior:

NPCs should behave according to their relationshipToParty and disposition.

Close friend:
- volunteers useful information
- gives emotional honesty
- may warn the party about danger
- may offer help without being asked
- may reveal personal concerns or private knowledge

Trusted ally:
- cooperates openly
- shares useful information
- offers practical help
- speaks with warmth and confidence

Ally:
- cooperates
- answers honestly
- may offer support if asked

Friendly:
- pleasant and helpful
- may share rumors, clues, or limited information

Acquaintance:
- polite but reserved
- shares only basic information

Wary or suspicious:
- cautious
- asks questions before helping
- withholds sensitive details

Hostile or enemy:
- refuses help
- may mislead, threaten, evade, or demand proof
- does not reveal secrets unless forced by strong story logic

Use these behaviors naturally. Do not announce the relationship category to the player.

Faction behavior memory:

Use faction reputation and faction history to shape how organizations behave toward the party.

Allied or friendly factions:
- offer aid, shelter, information, supplies, or introductions
- may ask for help with internal problems
- may speak warmly of the party

Neutral factions:
- behave normally unless directly involved
- may require payment, persuasion, or proof

Suspicious factions:
- watch the party carefully
- withhold sensitive information
- may test loyalty or demand explanations

Hostile factions:
- interfere with the party
- send spies, threats, false leads, or obstacles
- avoid open conflict unless they have advantage

Enemy factions:
- actively oppose the party
- set traps, hunt them, spread rumors, sabotage plans, or send agents

Use faction behavior naturally. Do not announce reputation levels to the player.

Faction memory is persistent.

NPCs, faction members, agents, guards, cultists, merchants, and local leaders may react differently based on the faction's recorded history with the party.

If a faction is hostile or enemy, members of that faction may recognize the party, investigate them, monitor them, avoid them, spread rumors about them, seek revenge, or interfere with their plans.

Faction history should create visible consequences in future scenes whenever appropriate.

Dynamic quest generation:

When a trusted ally or ally shares important information, they may naturally offer a side quest.

Examples:
- investigate a hidden location
- recover a lost artifact
- deliver a message
- protect a person
- uncover a secret
- solve a mystery

Side quests should emerge naturally from the NPC's history, role, goals, and relationship with the player.

Do not generate a side quest in every conversation.
Only do so when the NPC has a meaningful reason.

Players:
${JSON.stringify(memory.players, null, 2)}

Campaign:
${JSON.stringify(memory.campaign, null, 2)}

Quests:
${JSON.stringify(memory.quests, null, 2)}

NPCs:
${JSON.stringify(memory.npcs, null, 2)}

NPC Dialogue Context:
${getNpcDialogueContext(memory.npcs)}

NPC Opportunity Context:
${getNpcOpportunityContext(memory.npcs)}

Locations:
${JSON.stringify(memory.locations, null, 2)}

Factions:
${JSON.stringify(memory.factions, null, 2)}

Faction Context:
${getFactionContext(memory.factions)}

World State:
${JSON.stringify(memory.worldState, null, 2)}

World Events:
${JSON.stringify(memory.worldEvents, null, 2)}

Campaign History:
${JSON.stringify(memory.campaignHistory, null, 2)}

Command used: ${command || "/gm"}
Current player: ${playerName || "Player"}
Player message: ${message}`,
        },
      ],
    });

    const reply = response.content[0].text;

    console.log("MAIN KEEPER RESPONSE RECEIVED");

    // Automatic Memory Update System
const memoryUpdate = await analyzeMemoryUpdate(message, memory, reply);

    console.log("========== MEMORY ANALYZER RAW OUTPUT ==========");
    console.log(JSON.stringify(memoryUpdate, null, 2));
    console.log("================================================");

    if (
      memoryUpdate &&
      message &&
      /\b(destroy|destroyed|damage|damaged|restore|restored|corrupt|corrupted|cleanse|cleansed|fortify|fortified|abandon|abandoned|rebuild|rebuilt)\b/i.test(message)
    ) {
      const knownLocationNames = [
        "Observatory Tower",
        "Millhaven",
        "Ruined Cathedral Archives",
        "Skyreach Peaks"
      ];

      const matchedLocation = knownLocationNames.find((locationName) => {
        return message.toLowerCase().includes(locationName.toLowerCase());
      });

      if (matchedLocation) {
        let status = "changed";

        if (/\b(destroy|destroyed)\b/i.test(message)) status = "destroyed";
        if (/\b(damage|damaged)\b/i.test(message)) status = "damaged";
        if (/\b(restore|restored|rebuild|rebuilt)\b/i.test(message)) status = "restored";
        if (/\b(corrupt|corrupted)\b/i.test(message)) status = "corrupted";
        if (/\b(cleanse|cleansed)\b/i.test(message)) status = "cleansed";
        if (/\b(fortify|fortified)\b/i.test(message)) status = "fortified";
        if (/\b(abandon|abandoned)\b/i.test(message)) status = "abandoned";

        memoryUpdate.locationUpdate = {
          name: matchedLocation,
          status,
          description: `${matchedLocation} was ${status} as a result of the party's actions.`,
          relatedNPCs: memory.npcs.npcs
            .filter((npc) => {
              return message.toLowerCase().includes(npc.name.toLowerCase());
            })
            .map((npc) => npc.name),
        };
       }
     }

    if (
      memoryUpdate &&
      message &&
      /\b(we|i|party)\s+(destroy|burn|collapse|ruin|shatter|seal|save|restore)\b/i.test(message)
    ) {
      memoryUpdate.majorChoice =
        memoryUpdate.majorChoice || message.trim();

      const cleanedMessage = message
        .trim()
        .replace(/^I\s+/i, "")
       .replace(/\.$/, "");

      if (/destroy|destroyed/i.test(message)) {
        memoryUpdate.worldConsequence =
          `${cleanedMessage.charAt(0).toUpperCase()}${cleanedMessage.slice(1)}.`;
     } else if (/seal|sealed/i.test(message)) {
        memoryUpdate.worldConsequence =
          `${cleanedMessage.charAt(0).toUpperCase()}${cleanedMessage.slice(1)}.`;
      } else if (/save|saved/i.test(message)) {
        memoryUpdate.worldConsequence =
          `${cleanedMessage.charAt(0).toUpperCase()}${cleanedMessage.slice(1)}.`;
      } else if (/restore|restored/i.test(message)) {
        memoryUpdate.worldConsequence =
          `${cleanedMessage.charAt(0).toUpperCase()}${cleanedMessage.slice(1)}.`;
      }
    }

    if (memoryUpdate?.worldConsequence) {
      memoryUpdate.worldConsequence = memoryUpdate.worldConsequence
        .replace(/^Destroy\s+/i, "Destroyed ")
        .replace(/^Seal\s+/i, "Sealed ")
        .replace(/^Save\s+/i, "Saved ")
        .replace(/^Restore\s+/i, "Restored ");
    }

    if (memoryUpdate) {
      const worldState = readJsonFile("world-state.json", {
        currentLocation: "",
        currentObjective: "",
        completedObjectives: [],
        majorChoices: [],
        worldConsequences: [],
        sideQuests: [],
        discoveredLocations: [],
        metNPCs: [],
        sessionNotes: [],
      });

      let changed = false;

      // New Location
      if (memoryUpdate.newLocation) {
        worldState.currentLocation = memoryUpdate.newLocation;

        worldState.discoveredLocations = [
          ...new Set([
            ...(worldState.discoveredLocations || []),
            memoryUpdate.newLocation,
          ]),
        ];

        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: new location recorded - ${memoryUpdate.newLocation}`,
        ];

        changed = true;
      }

      // New Objective
      if (memoryUpdate.newObjective) {
        worldState.currentObjective = memoryUpdate.newObjective;

        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: objective set - ${memoryUpdate.newObjective}`,
        ];

        changed = true;
      }

      // Completed Objective
      if (memoryUpdate.completedObjective) {
        worldState.completedObjectives = [
          ...new Set([
            ...(worldState.completedObjectives || []),
            memoryUpdate.completedObjective,
          ]),
        ];

        if (
          worldState.currentObjective &&
          worldState.currentObjective === memoryUpdate.completedObjective
        ) {
         worldState.currentObjective = "";
        }

        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: objective completed - ${memoryUpdate.completedObjective}`,
        ];

        changed = true;
      }

      // Objective Progress
      if (memoryUpdate.objectiveProgress) {
        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: objective progress - ${memoryUpdate.objectiveProgress}`,
        ];

        changed = true;
      }

      // Advance Act
      if (memoryUpdate.advanceAct === true) {
        const campaign = readJsonFile("campaign.json", {});

        const activeQuest = getActiveQuest(memory.quests, campaign);
        const maxActs = activeQuest?.acts?.length || campaign.currentAct || 1;
        const previousAct = campaign.currentAct || 1;
        const nextAct = Math.min(previousAct + 1, maxActs);

        campaign.currentAct = nextAct;

        if (previousAct >= maxActs) {
          campaign.status = "completed";
          worldState.sessionNotes = [
            ...(worldState.sessionNotes || []),
            "Auto memory: campaign completed.",
          ];
        } else {
          worldState.sessionNotes = [
            ...(worldState.sessionNotes || []),
            `Auto memory: advanced to Act ${campaign.currentAct}`,
          ];
        }

        campaign.lastUpdated = new Date().toISOString();
        writeJsonFile("campaign.json", campaign);
      }

      // Side Quest
      if (memoryUpdate.sideQuest) {
        worldState.sideQuests = worldState.sideQuests || [];

        let newSideQuest;

        if (typeof memoryUpdate.sideQuest === "string") {
          newSideQuest = {
            title: "Untitled Side Quest",
            status: "active",
            description: memoryUpdate.sideQuest,
            createdAt: new Date().toISOString(),
          };
        } else {
          newSideQuest = {
            title: memoryUpdate.sideQuest.title || "Untitled Side Quest",
            status: memoryUpdate.sideQuest.status || "active",
            description: memoryUpdate.sideQuest.description || "",
            createdAt: new Date().toISOString(),
          };
        }

        if (newSideQuest.description) {
          const alreadyExists = worldState.sideQuests.some((quest) => {
            if (typeof quest === "string") {
              return quest.toLowerCase() === newSideQuest.description.toLowerCase();
            }

            return (
              String(quest.title || "").toLowerCase() ===
                newSideQuest.title.toLowerCase() ||
              String(quest.description || "").toLowerCase() ===
                newSideQuest.description.toLowerCase()
            );
          });

          if (!alreadyExists) {
            worldState.sideQuests.push(newSideQuest);

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: side quest added - ${newSideQuest.title}`,
            ];

            changed = true;
          }
        }
      }

      // NPC Personal Quest
      if (
        memoryUpdate.npcPersonalQuest &&
        memoryUpdate.npcPersonalQuest.npcName &&
        memoryUpdate.npcPersonalQuest.title &&
        memoryUpdate.npcPersonalQuest.description
      ) {
        const npcs = readJsonFile("npcs.json", { npcs: [] });

        const targetNpc = npcs.npcs.find((npc) => {
          return (
            npc.name.toLowerCase() ===
            memoryUpdate.npcPersonalQuest.npcName.toLowerCase()
          );
        });

        if (targetNpc) {
          targetNpc.personalQuests = targetNpc.personalQuests || [];

          const alreadyExists = targetNpc.personalQuests.some((quest) => {
            return (
              String(quest.title || "").toLowerCase() ===
              memoryUpdate.npcPersonalQuest.title.toLowerCase()
            );
          });

          if (!alreadyExists) {
            targetNpc.personalQuests.push({
              title: memoryUpdate.npcPersonalQuest.title,
              status: memoryUpdate.npcPersonalQuest.status || "active",
              description: memoryUpdate.npcPersonalQuest.description,
              createdAt: new Date().toISOString(),
            });

            targetNpc.updatedAt = new Date().toISOString();

            writeJsonFile("npcs.json", npcs);

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: NPC personal quest added - ${targetNpc.name}: ${memoryUpdate.npcPersonalQuest.title}`,
            ];

            changed = true;
          }
        }
      }

      // Completed NPC Personal Quest
      if (
        memoryUpdate.completedNpcPersonalQuest &&
        memoryUpdate.completedNpcPersonalQuest.npcName &&
        memoryUpdate.completedNpcPersonalQuest.title
      ) {
        const npcs = readJsonFile("npcs.json", { npcs: [] });

        const targetNpc = npcs.npcs.find((npc) => {
          return (
            npc.name.toLowerCase() ===
            memoryUpdate.completedNpcPersonalQuest.npcName.toLowerCase()
          );
        });

        if (targetNpc && targetNpc.personalQuests?.length) {
          const completedTitle =
            memoryUpdate.completedNpcPersonalQuest.title.toLowerCase();

          for (const quest of targetNpc.personalQuests) {
            const questTitle = String(quest.title || "").toLowerCase();

            if (
              questTitle.includes(completedTitle) ||
              completedTitle.includes(questTitle)
            ) {
              quest.status = "completed";
              quest.completedAt = new Date().toISOString();
              targetNpc.updatedAt = new Date().toISOString();

              writeJsonFile("npcs.json", npcs);

              worldState.sessionNotes = [
                ...(worldState.sessionNotes || []),
                `Auto memory: NPC personal quest completed - ${targetNpc.name}: ${quest.title}`,
              ];

              changed = true;
            }
          }
        }
      }

      // NPC Relationship Reward
      if (
        memoryUpdate.npcRelationshipReward &&
        memoryUpdate.npcRelationshipReward.npcName
      ) {
        const npcs = readJsonFile("npcs.json", { npcs: [] });

        const targetNpc = npcs.npcs.find((npc) => {
          return (
            npc.name.toLowerCase() ===
            memoryUpdate.npcRelationshipReward.npcName.toLowerCase()
          );
        });

        if (targetNpc) {
          if (memoryUpdate.npcRelationshipReward.relationshipToParty) {
            targetNpc.relationshipToParty =
              memoryUpdate.npcRelationshipReward.relationshipToParty;
          }

          if (memoryUpdate.npcRelationshipReward.disposition) {
            targetNpc.disposition =
              memoryUpdate.npcRelationshipReward.disposition;
          }

          if (memoryUpdate.npcRelationshipReward.note) {
            targetNpc.notes = targetNpc.notes || [];
            targetNpc.relationshipHistory = targetNpc.relationshipHistory || [];

            targetNpc.notes.push(
              `Auto memory: ${memoryUpdate.npcRelationshipReward.note}`
            );

            targetNpc.relationshipHistory.push(
              memoryUpdate.npcRelationshipReward.note
            );
          }

          targetNpc.updatedAt = new Date().toISOString();

          writeJsonFile("npcs.json", npcs);

          worldState.sessionNotes = [
            ...(worldState.sessionNotes || []),
            `Auto memory: NPC relationship reward applied - ${targetNpc.name}`,
          ];

          changed = true;
        }
      }

      // NPC Relationship Penalty
      if (
        memoryUpdate.npcRelationshipPenalty &&
        memoryUpdate.npcRelationshipPenalty.npcName
      ) {
        const npcs = readJsonFile("npcs.json", { npcs: [] });

        const targetNpc = npcs.npcs.find((npc) => {
          return (
            npc.name.toLowerCase() ===
            memoryUpdate.npcRelationshipPenalty.npcName.toLowerCase()
          );
        });

        if (targetNpc) {
          if (memoryUpdate.npcRelationshipPenalty.relationshipToParty) {
            targetNpc.relationshipToParty =
              memoryUpdate.npcRelationshipPenalty.relationshipToParty;
          }

          if (memoryUpdate.npcRelationshipPenalty.disposition) {
            targetNpc.disposition =
              memoryUpdate.npcRelationshipPenalty.disposition;
          }

          if (memoryUpdate.npcRelationshipPenalty.note) {
            targetNpc.notes = targetNpc.notes || [];
            targetNpc.relationshipHistory =
              targetNpc.relationshipHistory || [];

            targetNpc.notes.push(
              `Auto memory: ${memoryUpdate.npcRelationshipPenalty.note}`
            );

            targetNpc.relationshipHistory.push(
              memoryUpdate.npcRelationshipPenalty.note
            );

            if (targetNpc.relationshipHistory.length > 20) {
              targetNpc.relationshipHistory =
                targetNpc.relationshipHistory.slice(-20);
            }
          }

          targetNpc.updatedAt = new Date().toISOString();

          writeJsonFile("npcs.json", npcs);

          worldState.sessionNotes = [
            ...(worldState.sessionNotes || []),
            `Auto memory: NPC relationship penalty applied - ${targetNpc.name}`,
          ];

          changed = true;
        }
      }

      // Faction Update
      if (
        memoryUpdate.factionUpdate &&
        memoryUpdate.factionUpdate.factionName
      ) {
        const factions = readJsonFile("factions.json", {
          factions: [],
        });

        let faction = factions.factions.find((f) => {
          return (
            f.name.toLowerCase() ===
            memoryUpdate.factionUpdate.factionName.toLowerCase()
          );
        });

        if (!faction) {
          faction = {
            name: memoryUpdate.factionUpdate.factionName,
            reputation:
              memoryUpdate.factionUpdate.reputation || "neutral",
            history: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          factions.factions.push(faction);
        }

        if (memoryUpdate.factionUpdate.reputation) {
          faction.reputation =
            memoryUpdate.factionUpdate.reputation;
        }

        if (memoryUpdate.factionUpdate.note) {
          faction.history.push(memoryUpdate.factionUpdate.note);

          if (faction.history.length > 50) {
            faction.history = faction.history.slice(-50);
          }
        }

        faction.updatedAt = new Date().toISOString();

        writeJsonFile("factions.json", factions);

        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: faction updated - ${faction.name}`,
        ];

        changed = true;
      }

      // Faction Reputation Change
      if (
        memoryUpdate.factionReputationChange &&
        memoryUpdate.factionReputationChange.factionName
      ) {
        const factions = readJsonFile("factions.json", {
          factions: [],
        });

        const faction = factions.factions.find((f) => {
          return (
            f.name.toLowerCase() ===
            memoryUpdate.factionReputationChange.factionName.toLowerCase()
          );
        });

        if (faction) {
          faction.reputation = getNextFactionReputation(
            faction.reputation,
            memoryUpdate.factionReputationChange.direction
          );

          if (memoryUpdate.factionReputationChange.note) {
            faction.history.push(
              memoryUpdate.factionReputationChange.note
            );
          }

          faction.updatedAt = new Date().toISOString();

          writeJsonFile("factions.json", factions);

          worldState.sessionNotes = [
            ...(worldState.sessionNotes || []),
            `Auto memory: faction reputation changed - ${faction.name} (${faction.reputation})`,
          ];

          changed = true;
        }
      }

      // Faction Quest
      if (
        memoryUpdate.factionQuest &&
        memoryUpdate.factionQuest.factionName &&
        memoryUpdate.factionQuest.title
      ) {
        const factions = readJsonFile("factions.json", {
          factions: [],
        });

        let faction = factions.factions.find((f) => {
          return (
            f.name.toLowerCase() ===
            memoryUpdate.factionQuest.factionName.toLowerCase()
          );
        });

        if (faction) {
          faction.questChains = faction.questChains || [];

          const exists = faction.questChains.some((quest) => {
            return (
              String(quest.title || "").toLowerCase() ===
              memoryUpdate.factionQuest.title.toLowerCase()
            );
          });

          if (!exists) {
            faction.questChains.push({
              title: memoryUpdate.factionQuest.title,
              status:
                memoryUpdate.factionQuest.status || "active",
              description:
                memoryUpdate.factionQuest.description || "",
              createdAt: new Date().toISOString(),
            });

            faction.updatedAt = new Date().toISOString();

            writeJsonFile("factions.json", factions);

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: faction quest added - ${faction.name}: ${memoryUpdate.factionQuest.title}`,
            ];

            changed = true;
          }
        }
      }

      // Completed Faction Quest
      if (
        memoryUpdate.completedFactionQuest &&
        memoryUpdate.completedFactionQuest.factionName &&
        memoryUpdate.completedFactionQuest.title
      ) {
        const factions = readJsonFile("factions.json", {
          factions: [],
        });

        const faction = factions.factions.find((f) => {
          return (
            f.name.toLowerCase() ===
            memoryUpdate.completedFactionQuest.factionName.toLowerCase()
          );
        });

        if (faction && faction.questChains?.length) {
          const completedTitle =
             memoryUpdate.completedFactionQuest.title.toLowerCase();

          for (const quest of faction.questChains) {
            const questTitle = String(quest.title || "").toLowerCase();

            if (
              questTitle.includes(completedTitle) ||
              completedTitle.includes(questTitle)
            ) {
              if (quest.status === "failed") {
                continue;
              }
              quest.status = "completed";
              quest.completedAt = new Date().toISOString();

              faction.updatedAt = new Date().toISOString();

              writeJsonFile("factions.json", factions);

              worldState.sessionNotes = [
                ...(worldState.sessionNotes || []),
                `Auto memory: faction quest completed - ${faction.name}: ${quest.title}`,
              ];

              changed = true;
            }
          }
        }
      }

      // Failed Faction Quest
      if (
        memoryUpdate.failedFactionQuest &&
        memoryUpdate.failedFactionQuest.factionName &&
        memoryUpdate.failedFactionQuest.title
      ) {
        const factions = readJsonFile("factions.json", {
          factions: [],
        });

        const faction = factions.factions.find((f) => {
          return (
            f.name.toLowerCase() ===
            memoryUpdate.failedFactionQuest.factionName.toLowerCase()
          );
        });

        if (faction && faction.questChains?.length) {
          const failedTitle =
            memoryUpdate.failedFactionQuest.title.toLowerCase();

          for (const quest of faction.questChains) {
            const questTitle = String(quest.title || "").toLowerCase();

            if (
              questTitle.includes(failedTitle) ||
              failedTitle.includes(questTitle)
            ) {
              if (quest.status === "completed") {
                continue;
              }
              quest.status = "failed";
              quest.failedAt = new Date().toISOString();

              faction.updatedAt = new Date().toISOString();

              writeJsonFile("factions.json", factions);

              worldState.sessionNotes = [
                ...(worldState.sessionNotes || []),
                `Auto memory: faction quest failed - ${faction.name}: ${quest.title}`,
              ];

              changed = true;
            }
          }
        }
      }

      // Completed Side Quest
      if (memoryUpdate.completedSideQuest) {
        worldState.sideQuests = worldState.sideQuests || [];

        const completedTitle = memoryUpdate.completedSideQuest.toLowerCase();

        for (const quest of worldState.sideQuests) {
          if (typeof quest === "string") continue;

          const title = String(quest.title || "").toLowerCase();
          const description = String(quest.description || "").toLowerCase();

          if (
            title.includes(completedTitle) ||
            completedTitle.includes(title) ||
            description.includes(completedTitle)
          ) {
            quest.status = "completed";
            quest.completedAt = new Date().toISOString();

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: side quest completed - ${quest.title}`,
            ];

            changed = true;
          }
        }
      }

      // Failed Side Quest
      if (memoryUpdate.failedSideQuest) {
        worldState.sideQuests = worldState.sideQuests || [];

        const failedTitle = memoryUpdate.failedSideQuest.toLowerCase();

        for (const quest of worldState.sideQuests) {
          if (typeof quest === "string") continue;

          const title = String(quest.title || "").toLowerCase();
          const description = String(quest.description || "").toLowerCase();

          if (
            title.includes(failedTitle) ||
            failedTitle.includes(title) ||
            description.includes(failedTitle)
          ) {
            quest.status = "failed";
            quest.failedAt = new Date().toISOString();

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: side quest failed - ${quest.title}`,
            ];

            changed = true;
          }
        }
      }

      // Ignored Side Quest
      if (memoryUpdate.ignoredSideQuest) {
        worldState.sideQuests = worldState.sideQuests || [];

        const ignoredTitle = memoryUpdate.ignoredSideQuest.toLowerCase();

        for (const quest of worldState.sideQuests) {
          if (typeof quest === "string") continue;

          const title = String(quest.title || "").toLowerCase();
          const description = String(quest.description || "").toLowerCase();

          if (
            title.includes(ignoredTitle) ||
            ignoredTitle.includes(title) ||
            description.includes(ignoredTitle)
          ) {
            quest.status = "ignored";
            quest.ignoredAt = new Date().toISOString();

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: side quest ignored - ${quest.title}`,
            ];

            changed = true;
          }
        }
      }

      // World Event
      if (
        memoryUpdate.worldEvent &&
        memoryUpdate.worldEvent.title &&
        memoryUpdate.worldEvent.description
      ) {
        const worldEvents = readJsonFile("world-events.json", {
          events: [],
        });

        const alreadyExists = worldEvents.events.some((event) => {
          return (
            String(event.title || "").toLowerCase() ===
            memoryUpdate.worldEvent.title.toLowerCase()
          );
        });

        if (!alreadyExists) {
          worldEvents.events.push({
            title: memoryUpdate.worldEvent.title,
            status: memoryUpdate.worldEvent.status || "active",
            description: memoryUpdate.worldEvent.description,
            createdAt: new Date().toISOString(),
          });

          writeJsonFile("world-events.json", worldEvents);

          worldState.sessionNotes = [
            ...(worldState.sessionNotes || []),
            `Auto memory: world event added - ${memoryUpdate.worldEvent.title}`,
          ];

          changed = true;
        }
      }

      // Location Update
      if (
        memoryUpdate.locationUpdate &&
        memoryUpdate.locationUpdate.name
      ) {
        const locations = readJsonFile("locations.json", {
          locations: [],
        });

        let location = locations.locations.find((loc) => {
          return (
            loc.name.toLowerCase() ===
            memoryUpdate.locationUpdate.name.toLowerCase()
          );
        });

        if (!location) {
          location = {
            name: memoryUpdate.locationUpdate.name,
            status:
              memoryUpdate.locationUpdate.status || "active",
            description:
              memoryUpdate.locationUpdate.description || "",
            history: [],
            relatedNPCs: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          locations.locations.push(location);
        }

        if (memoryUpdate.locationUpdate.status) {
          location.status =
            memoryUpdate.locationUpdate.status;
        }

        if (memoryUpdate.locationUpdate.description) {
          location.description =
            memoryUpdate.locationUpdate.description;
        }

        location.history = location.history || [];

        location.relatedNPCs = location.relatedNPCs || [];

        if (Array.isArray(memoryUpdate.locationUpdate.relatedNPCs)) {
          location.relatedNPCs = [
            ...new Set([
              ...location.relatedNPCs,
              ...memoryUpdate.locationUpdate.relatedNPCs,
            ]),
          ];
        }

        if (memoryUpdate.locationUpdate.description) {
          const note = memoryUpdate.locationUpdate.description;

          const alreadyExists = location.history.some((entry) => {
            return entry.note === note;
          });

          if (!alreadyExists) {
            location.history.push({
              date: new Date().toISOString(),
              note,
            });
          }

          if (location.history.length > 50) {
            location.history = location.history.slice(-50);
          }
        }

        location.updatedAt = new Date().toISOString();

        writeJsonFile("locations.json", locations);

        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: location updated - ${location.name}`,
        ];

        changed = true;
      }

      // Resolved World Event
      if (memoryUpdate.resolvedWorldEvent) {
        const worldEvents = readJsonFile("world-events.json", {
          events: [],
        });

        const resolvedTitle = memoryUpdate.resolvedWorldEvent.toLowerCase();

        for (const event of worldEvents.events) {
          const title = String(event.title || "").toLowerCase();

          if (
            title.includes(resolvedTitle) ||
            resolvedTitle.includes(title)
          ) {
          if (event.status === "resolved") {
            continue;
          }
          if (event.status === "escalated") {
            continue;
          }
            event.status = "resolved";
            event.resolvedAt = new Date().toISOString();

            writeJsonFile("world-events.json", worldEvents);

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: world event resolved - ${event.title}`,
            ];

            changed = true;
          }
        }
      }

      // Escalated World Event
      if (memoryUpdate.escalatedWorldEvent) {
        const worldEvents = readJsonFile("world-events.json", {
          events: [],
        });

        const escalatedTitle = memoryUpdate.escalatedWorldEvent.toLowerCase();

        for (const event of worldEvents.events) {
          const title = String(event.title || "").toLowerCase();

          if (
            title.includes(escalatedTitle) ||
            escalatedTitle.includes(title)
          ) {
          
          if (event.status === "resolved") {
            continue;
          }

          if (event.status === "escalated") {
            continue;
          }
            event.status = "escalated";
            event.escalatedAt = new Date().toISOString();

            writeJsonFile("world-events.json", worldEvents);

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: world event escalated - ${event.title}`,
            ];

            changed = true;
          }
        }
      }
      // Archived World Event
      if (memoryUpdate.archivedWorldEvent) {
        const worldEvents = readJsonFile("world-events.json", {
          events: [],
        });

        const archivedTitle =
          memoryUpdate.archivedWorldEvent.toLowerCase();

        for (const event of worldEvents.events) {
          const title = String(event.title || "").toLowerCase();

          if (
            title.includes(archivedTitle) ||
            archivedTitle.includes(title)
          ) {
            if (event.status === "active") {
              continue;
            }

            event.status = "archived";
            event.archivedAt = new Date().toISOString();

            writeJsonFile("world-events.json", worldEvents);

            worldState.sessionNotes = [
              ...(worldState.sessionNotes || []),
              `Auto memory: world event archived - ${event.title}`,
            ];

            changed = true;
          }
        }
      }
      
      // Major Choice
      if (memoryUpdate.majorChoice) {
        worldState.majorChoices = [
          ...new Set([
            ...(worldState.majorChoices || []),
            memoryUpdate.majorChoice,
          ]),
        ];

        worldState.sessionNotes = [
          ...(worldState.sessionNotes || []),
          `Auto memory: major choice recorded - ${memoryUpdate.majorChoice}`,
        ];

        changed = true;
      }

      if (memoryUpdate.npcUpdates && memoryUpdate.npcUpdates.length) {
        const npcs = readJsonFile("npcs.json", { npcs: [] });

        for (const update of memoryUpdate.npcUpdates) {
          if (!update.npcName) continue;

          const npc = npcs.npcs.find((entry) => {
            return entry.name.toLowerCase() === update.npcName.toLowerCase();
          });

          if (!npc) continue;

          if (update.knownByPlayers !== null && update.knownByPlayers !== undefined) {
            npc.knownByPlayers = update.knownByPlayers;
          }

          const evolvedRelationship = evolveNpcRelationship(
            npc.relationshipToParty,
            npc.disposition,
            update
          );

          npc.relationshipToParty = evolvedRelationship.relationshipToParty;
          npc.disposition = evolvedRelationship.disposition;

          if (update.note) {
            npc.notes = npc.notes || [];
            npc.notes.push(`Auto memory: ${update.note}`);
          }

          npc.relationshipHistory = npc.relationshipHistory || [];

          if (update.note) {
            npc.relationshipHistory.push(update.note);

            if (npc.relationshipHistory.length > 20) {
              npc.relationshipHistory =
                npc.relationshipHistory.slice(-20);
            }
          }

          npc.updatedAt = new Date().toISOString();
        }

        writeJsonFile("npcs.json", npcs);
        changed = true;
      }

      if (changed) {
        writeJsonFile("world-state.json", worldState);
        console.log("========== AUTO MEMORY UPDATE ==========");
        console.log(JSON.stringify(memoryUpdate, null, 2));
        console.log("========================================");
      }
    }

    const finalReply =
      memoryUpdate?.advanceAct === true
        ? `${reply}

    The threads of this chapter have shifted.

    Would you like to continue this campaign, or start a new one with /quest?`
        : reply;

    res.json({ reply: finalReply });
  } catch (error) {
    console.error("AI Game Master error:", error);
    res.status(500).json({
      error: "The AI Game Master backend had an error.",
      details: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`AI Game Master backend running on http://localhost:${port}`);
});
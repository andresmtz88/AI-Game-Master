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
  async function analyzeMemoryUpdate(message, memory) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `You are a memory extraction system.

  Analyze the player's action.

  Return JSON only.

  {
    "newLocation": "",
    "newObjective": "",
    "completedObjective": "",
    "majorChoice": "",
    "npcUpdates": []
  }

  Known NPCs:
  ${JSON.stringify(memory.npcs, null, 2)}

  Current World State:
  ${JSON.stringify(memory.worldState, null, 2)}

  Player Action:
  ${message}`
          }
        ]
      });

      return extractJson(response.content[0].text);

    } catch (error) {
      console.error("Memory analysis failed:", error);
      return null;
    }
  }
  return {
    players: readJsonFile("players.json", { players: [] }),
    campaign: readJsonFile("campaign.json", {}),
    quests: readJsonFile("quests.json", {
      activeQuests: [],
      completedQuests: [],
      archivedQuests: [],
    }),
    npcs: readJsonFile("npcs.json", { npcs: [] }),
    locations: readJsonFile("locations.json", { locations: [] }),
    worldState: readJsonFile("world-state.json", {
      currentLocation: "",
      currentObjective: "",
      completedObjectives: [],
      majorChoices: [],
      discoveredLocations: [],
      metNPCs: [],
      sessionNotes: [],
    }),
    campaignHistory: readJsonFile("campaign-history.json", { campaigns: [] }),
  };
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

      const campaignResponse = `Campaign Journal

Campaign:
${memory.campaign.campaignName || activeQuest.campaignName || "Untitled Campaign"}

Main Quest:
${activeQuest.title}

Status:
${memory.campaign.status || "unknown"}

Current Act:
Act ${memory.campaign.currentAct || 1}: ${activeQuest.acts?.[0]?.title || "Unknown"}

Theme:
${memory.campaign.theme || activeQuest.theme || "Unknown"}

Tone:
${memory.campaign.tone || activeQuest.tone || "Unknown"}

Difficulty:
${activeQuest.difficulty || "Unknown"}

Summary:
${memory.campaign.summary || activeQuest.premise || "No summary recorded."}

Known NPCs:
${npcList}

Current Location:
${memory.worldState.currentLocation || "Not established yet."}

Current Objective:
${memory.worldState.currentObjective || "Begin the adventure with /begin, then choose how to proceed from the opening scene."}

Major Choices:
${majorChoices}

Discovered Locations:
${discoveredLocations}`;

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

      const beginResponse = `The Keeper opens the Chronicle of Realms...

Campaign: ${memory.campaign.campaignName || activeQuest.campaignName || "Untitled Campaign"}
Main Quest: ${activeQuest.title}

Act ${memory.campaign.currentAct || 1}: ${activeQuest.acts[0]?.title || "Unknown"}

Opening Scene:
${activeQuest.openingScene}

Important NPCs currently tied to this quest:
${npcList}

First Choice:
${activeQuest.firstPlayerChoice}

What do you do?`;

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

Players:
${JSON.stringify(memory.players, null, 2)}

Campaign:
${JSON.stringify(memory.campaign, null, 2)}

Quests:
${JSON.stringify(memory.quests, null, 2)}

NPCs:
${JSON.stringify(memory.npcs, null, 2)}

Locations:
${JSON.stringify(memory.locations, null, 2)}

World State:
${JSON.stringify(memory.worldState, null, 2)}

Campaign History:
${JSON.stringify(memory.campaignHistory, null, 2)}

Command used: ${command || "/gm"}
Current player: ${playerName || "Player"}
Player message: ${message}`,
        },
      ],
    });

    const reply = response.content[0].text;

    const memoryUpdate = await analyzeMemoryUpdate(message, memory);

    if (memoryUpdate) {
      const worldState = readJsonFile("world-state.json", {
        currentLocation: "",
        currentObjective: "",
        completedObjectives: [],
        majorChoices: [],
        discoveredLocations: [],
        metNPCs: [],
        sessionNotes: []
      });

      if (memoryUpdate.newLocation) {
        worldState.currentLocation = memoryUpdate.newLocation;

        worldState.discoveredLocations = [
          ...new Set([
            ...(worldState.discoveredLocations || []),
            memoryUpdate.newLocation
          ])
        ];
      }

      if (memoryUpdate.newObjective) {
        worldState.currentObjective = memoryUpdate.newObjective;
      }

      if (memoryUpdate.completedObjective) {
        worldState.completedObjectives = [
          ...new Set([
            ...(worldState.completedObjectives || []),
            memoryUpdate.completedObjective
          ])
        ];
      }

      if (memoryUpdate.majorChoice) {
        worldState.majorChoices = [
          ...new Set([
            ...(worldState.majorChoices || []),
            memoryUpdate.majorChoice
          ])
        ];
      }

      writeJsonFile("world-state.json", worldState);
    }

    res.json({ reply });
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
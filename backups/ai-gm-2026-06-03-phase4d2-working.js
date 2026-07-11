const MODULE_ID = "ai-game-master";

const HINT_SLOTS = [
  { slot: 1, cooldownMinutes: 30 },
  { slot: 2, cooldownMinutes: 60 },
  { slot: 3, cooldownMinutes: 90 }
];

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "hintState", {
    name: "Hint State",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
});

Hooks.once("ready", () => {
  console.log("Keeper of the Infinite Realms module loaded.");

  ChatMessage.create({
    content: "<strong>Keeper of the Infinite Realms:</strong> Module loaded successfully."
  });
});

Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
  const validCommands = [
    "/campaign",
    "/begin",
    "/quest",
    "/rules",
    "/hint",
    "/lore",
    "/ooc",
    "/gm"
  ];

  const command = validCommands.find((cmd) => {
    return messageText === cmd || messageText.startsWith(`${cmd} `);
  });

  if (!command) return true;

  const playerMessage = messageText.replace(command, "").trim();

  if (!playerMessage && command !== "/begin" && command !== "/quest" && command !== "/campaign") {
    ui.notifications.warn(`Please enter a message after ${command}`);
    return false;
  }

  handleKeeperCommand(command, playerMessage);

  return false;
});

async function handleKeeperCommand(command, playerMessage) {
  const playerName = getKeeperPlayerName();

  if (command === "/hint") {
    const hintCheck = await tryUseHint();

    if (!hintCheck.allowed) {
      ChatMessage.create({
        content: `<strong>Keeper of the Infinite Realms:</strong><br>${hintCheck.message}`
      });
      return;
    }

    ChatMessage.create({
      content: `<strong>${playerName} used Hint ${hintCheck.slot}.</strong><br>${hintCheck.message}`
    });
  } else if (playerMessage) {
    ChatMessage.create({
      content: `<strong>${playerName}:</strong> ${playerMessage}`
    });
  } else {
    ChatMessage.create({
      content: `<strong>${playerName}:</strong> ${command}`
    });
  }

  try {
    const response = await fetch("http://localhost:3000/gm-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName: playerName,
        command: command,
        message: playerMessage
      })
    });

    const data = await response.json();

    ChatMessage.create({
      content: `<strong>Keeper of the Infinite Realms:</strong><br>${data.reply || data.error || "No response received from backend."}`
    });
  } catch (error) {
    console.error(error);

    ChatMessage.create({
      content: `<strong>Keeper Error:</strong> Could not reach backend server.`
    });
  }
}

async function tryUseHint() {
  const playerId = game.user.id;
  const playerName = getKeeperPlayerName();
  const now = Date.now();

  const hintState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hintState") || {});

  if (!hintState[playerId]) {
    hintState[playerId] = {
      playerName: playerName,
      hints: [
        { slot: 1, usedAt: null },
        { slot: 2, usedAt: null },
        { slot: 3, usedAt: null }
      ]
    };
  }

  hintState[playerId].playerName = playerName;

  const playerHints = hintState[playerId].hints;

  for (const hint of playerHints) {
    const slotConfig = HINT_SLOTS.find((h) => h.slot === hint.slot);
    const cooldownMs = slotConfig.cooldownMinutes * 60 * 1000;

    if (hint.usedAt === null || now - hint.usedAt >= cooldownMs) {
      hint.usedAt = now;
      await game.settings.set(MODULE_ID, "hintState", hintState);

      return {
        allowed: true,
        slot: hint.slot,
        message: `This hint slot will recharge in ${slotConfig.cooldownMinutes} real-time minutes.`
      };
    }
  }

  const cooldownMessages = playerHints.map((hint) => {
    const slotConfig = HINT_SLOTS.find((h) => h.slot === hint.slot);
    const cooldownMs = slotConfig.cooldownMinutes * 60 * 1000;
    const timeRemainingMs = Math.max(0, cooldownMs - (now - hint.usedAt));
    const minutesRemaining = Math.ceil(timeRemainingMs / 60000);

    return `Hint ${hint.slot}: ${minutesRemaining} minute(s) remaining`;
  });

  return {
    allowed: false,
    message: `You have no hints available right now.<br><br>${cooldownMessages.join("<br>")}`
  };
}

function getKeeperPlayerName() {
  return "Andres";
}
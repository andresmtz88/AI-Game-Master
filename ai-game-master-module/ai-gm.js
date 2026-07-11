Hooks.once("ready", () => {
  console.log("Keeper of the Infinite Realms module loaded.");

  ChatMessage.create({
    content: "<strong>Keeper of the Infinite Realms:</strong> Module loaded successfully."
  });
});

Hooks.on("chatMessage", async (chatLog, messageText, chatData) => {
  const validCommands = ["/gm", "/hint", "/rules", "/lore", "/ooc", "/quest"];

  const command = validCommands.find((cmd) => messageText.startsWith(cmd));

  if (!command) return;

  const playerMessage = messageText.replace(command, "").trim();

  if (!playerMessage) {
    ui.notifications.warn(`Please enter a message after ${command}`);
    return false;
  }

  ChatMessage.create({
    content: `<strong>${game.user.name}:</strong> ${playerMessage}`
  });

  try {
    const response = await fetch("http://localhost:3000/gm-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName: game.user.name,
        command: command,
        message: playerMessage
      })
    });

    const data = await response.json();

    ChatMessage.create({
      content: `<strong>Keeper of the Infinite Realms:</strong><br>${data.reply}`
    });
  } catch (error) {
    console.error(error);

    ChatMessage.create({
      content: `<strong>Keeper Error:</strong> Could not reach backend server.`
    });
  }

  return false;
});
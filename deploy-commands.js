require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { clientId } = require("./config.json"); // guildId はグローバルコマンドにするなら不要なので削除
const token = process.env.DISCORD_TOKEN;
const fs = require("node:fs");
const path = require("node:path");

const commands = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  // Grab all the command files from the commands directory you created earlier
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    // 追加: 登録するコマンドの名前を一覧表示
    console.log("登録しようとしているコマンド:");
    commands.forEach((command) => {
      console.log(`- ${command.name}`);
    });

    // The put method is used to fully refresh all commands globally with the current set
    const data = await rest.put(
      Routes.applicationCommands(clientId), // グローバルコマンドの場合
      { body: commands },
    );

    console.log(`${data.length}のスラッシュコマンドの追加に成功したよ！`);
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();

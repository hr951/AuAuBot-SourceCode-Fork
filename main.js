require("dotenv").config(); // Replitでも書いてOK（なくても動くことが多い）
const token = process.env.DISCORD_TOKEN;

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: Object.values(GatewayIntentBits).reduce((a, b) => a | b),
});

client.on("ready", () => {
    console.log(`${client.user.tag}でログインしました!!`);
});

client.on("messageCreate", async (msg) => {
    if (msg.content === "!ping") {
        msg.reply("Botは応答してるよ!");
    }
});

client.login(token);

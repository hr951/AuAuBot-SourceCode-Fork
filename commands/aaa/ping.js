const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("応答確認するよ～"),
  async execute(interaction) {
    await interaction.reply("応答してるよ!");
  },
};

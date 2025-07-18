const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("factcheck")
    .setDescription("※スラッシュには対応しておりませんでした(泣)"),

  async execute(interaction) {
    await interaction.reply({
      content:
        "スラッシュコマンドでのファクトチェックには対応しておりませんでした。\n" +
        "ファクトチェックしたいメッセージにリプライして\n" +
        "```\n@あうあうBot ファクトチェック\n```" +
        "と送信するとファクトチェックできます",
      ephemeral: true, // 他の人には見えない
    });
  },
};

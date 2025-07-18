const { SlashCommandBuilder } = require("discord.js");
const { getVoiceConnection } = require("@discordjs/voice");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("ボイスチャンネルから退出するよ～"),

  async execute(interaction) {
    try {
      // 現在のボイス接続を取得
      const connection = getVoiceConnection(interaction.guild.id);

      if (!connection) {
        return await interaction.reply("ボイスチャンネルに接続していません。");
      }

      // ユーザーがボイスチャンネルに接続しているかチェック
      let voiceChannel = null;

      if (interaction.member?.voice?.channel) {
        voiceChannel = interaction.member.voice.channel;
      } else {
        const member = await interaction.guild.members.fetch(
          interaction.user.id,
        );
        voiceChannel = member.voice.channel;
      }

      if (!voiceChannel) {
        return await interaction.reply(
          "ボイスチャンネルに接続してから使ってね！",
        );
      }

      // ボイス接続を切断
      connection.destroy();

      await interaction.reply(`✅ **${voiceChannel.name}** から退出しました！`);
    } catch (error) {
      console.error("退出エラー:", error);
      await interaction.reply("退出中にエラーが発生しました。");
    }
  },
};

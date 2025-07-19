const { SlashCommandBuilder } = require("@discordjs/builders");
const { QueryType, useQueue } = require("discord-player");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play-beta")
    .setDescription("音楽を再生します")
    .addStringOption((option) =>
      option.setName("url").setDescription("YouTube URL").setRequired(true),
    ),

  execute: async (interaction) => {
    const client = interaction.client;

    if (!interaction.member?.voice?.channelId) {
      return await interaction.reply({
        content: "ボイスチャンネルに参加してください",
        ephemeral: true,
      });
    }

    const url = interaction.options.getString("url");

    const { track } = await client.player.play(
      interaction.member.voice.channel,
      url,
      {
        nodeOptions: {
          metadata: interaction,
          leaveOnEnd: false,
          leaveOnStop: false,
          leaveOnEmpty: true,
          volume: 80,
        },
        requestedBy: interaction.user,
        searchEngine: QueryType.YOUTUBE_VIDEO,
      },
    );

    return await interaction.reply({
      content: `音楽を再生中: **${track.title}**`,
    });
  },
};

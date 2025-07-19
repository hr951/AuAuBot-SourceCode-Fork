const { SlashCommandBuilder } = require("@discordjs/builders");
const { QueryType } = require("discord-player");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play-beta")
    .setDescription("音楽を再生します")
    .addStringOption((option) =>
      option.setName("url").setDescription("YouTube URL").setRequired(true),
    ),

  // ← run → execute に修正
  execute: async ({ client, interaction }) => {
    if (!interaction.member.voice.channelId) {
      return await interaction.reply({
        content: "ボイスチャンネルに参加してください",
        ephemeral: true,
      });
    }

    if (
      interaction.guild.me.voice.channelId &&
      interaction.member.voice.channelId !==
        interaction.guild.me.voice.channelId
    ) {
      return await interaction.reply({
        content: "botと同じボイスチャンネルに参加してください",
        ephemeral: true,
      });
    }

    const queue = client.player.createQueue(interaction.guild, {
      metadata: {
        channel: interaction.channel,
      },
    });

    try {
      if (!queue.connection) {
        await queue.connect(interaction.member.voice.channel);
      }
    } catch {
      queue.destroy();
      return await interaction.reply({
        content: "ボイスチャンネルに参加できませんでした",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const url = interaction.options.getString("url");
    const track = await client.player
      .search(url, {
        requestedBy: interaction.user,
        searchEngine: QueryType.YOUTUBE_VIDEO,
      })
      .then((x) => x.tracks[0]);

    if (!track) {
      return await interaction.followUp({
        content: "動画が見つかりませんでした",
      });
    }

    await queue.addTrack(track);

    if (!queue.playing) {
      queue.play();
    }

    return await interaction.followUp({
      content: `音楽をキューに追加しました **${track.title}**`,
    });
  },
};

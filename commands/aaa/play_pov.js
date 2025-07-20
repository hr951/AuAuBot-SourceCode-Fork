const { SlashCommandBuilder } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const youtubedl = require("youtube-dl-exec");
const { createReadStream } = require("fs");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play_pov")
    .setDescription("音楽を再生します（YouTube・ニコニコ対応）")
    .addStringOption((option) =>
      option.setName("url").setDescription("動画のURL").setRequired(true),
    ),

  async execute(interaction) {
    const url = interaction.options.getString("url");

    // VC取得
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return await interaction.reply("ボイスチャンネルに参加してね！");
    }

    await interaction.reply("再生準備中...");

    // 音声ファイルのパス
    const outputPath = path.resolve(__dirname, "../../temp_audio.mp3");

    // 既存ファイル削除（もしあれば）
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    // yt-dlpで音声抽出
    await youtubedl(url, {
      output: outputPath,
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 0,
      ffmpegLocation: require("ffmpeg-static"),
    });

    // 接続
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // 再生プレイヤー作成
    const player = createAudioPlayer();
    const resource = createAudioResource(createReadStream(outputPath));
    player.play(resource);

    connection.subscribe(player);

    // 再生完了後の処理
    player.on(AudioPlayerStatus.Idle, () => {
      connection.destroy();
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    });

    await interaction.editReply("🎵 再生中！");
  },
};

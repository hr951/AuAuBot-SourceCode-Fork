const { SlashCommandBuilder } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const youtubedl = require("youtube-dl-exec");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("YouTubeの音楽を再生するよ～")
    .addStringOption((option) =>
      option.setName("url").setDescription("YouTubeのURL").setRequired(true),
    ),

  async execute(interaction) {
    try {
      console.log("コマンド実行開始");

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

      // ボットの権限をチェック
      const permissions = voiceChannel.permissionsFor(interaction.client.user);
      if (!permissions.has("Connect") || !permissions.has("Speak")) {
        return await interaction.reply(
          "ボイスチャンネルに接続または発言する権限がありません！",
        );
      }

      const url = interaction.options.getString("url");

      // YouTube URLの検証
      if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
        return await interaction.reply("有効なYouTubeのURLを入力してね！");
      }

      await interaction.reply("音楽を準備中...🎵");

      // ボイスチャンネルに接続
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      // 動画情報を取得
      const info = await youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
      });

      const title = info.title;
      console.log("動画情報取得完了:", title);

      // 音声ストリームを作成（修正されたフォーマット指定）
      const stream = youtubedl.exec(url, {
        output: "-",
        format: "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
        limitRate: "100K",
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
      });

      // オーディオリソースを作成
      const resource = createAudioResource(stream.stdout, {
        inputType: "arbitrary",
      });

      // オーディオプレイヤーを作成
      const player = createAudioPlayer();

      // プレイヤーのイベントリスナー
      player.on(AudioPlayerStatus.Playing, () => {
        console.log("音楽を再生中...");
      });

      player.on(AudioPlayerStatus.Idle, () => {
        console.log("音楽の再生が終了しました");
        connection.destroy();
      });

      player.on("error", (error) => {
        console.error("プレイヤーエラー:", error);
        connection.destroy();
      });

      // 接続エラーハンドリング
      connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log("ボイスチャンネルから切断されました");
        connection.destroy();
      });

      connection.on("error", (error) => {
        console.error("接続エラー:", error);
        connection.destroy();
      });

      // 接続にプレイヤーを設定
      connection.subscribe(player);

      // 音楽を再生
      player.play(resource);

      // 再生開始メッセージを送信
      await interaction.editReply(`🎵 **${title}** を再生中！`);
    } catch (error) {
      console.error("音楽再生エラー:", error);
      await interaction.editReply(
        "音楽の再生中にエラーが発生しました。URLを確認してください。",
      );
    }
  },
};

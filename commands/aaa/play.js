const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const youtubedl = require("youtube-dl-exec");
const { spawn } = require("child_process");
const path = require("path");

function loadCookiePath() {
  const cookiePath = "/tmp/youtube_cookies.txt"; // Renderで使う場所
  if (fs.existsSync(cookiePath)) {
    console.log("✅ Cookieファイルが見つかりました:", cookiePath);
    return cookiePath;
  } else {
    console.warn("⚠️ Cookieファイルが存在しません:", cookiePath);
    return null;
  }
}

const cookieFile = loadCookiePath();

// グローバルな音楽キューとプレイヤー管理
if (!global.musicQueues) {
  global.musicQueues = new Map();
}
if (!global.musicPlayers) {
  global.musicPlayers = new Map();
}
if (!global.musicConnections) {
  global.musicConnections = new Map();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("YouTubeやニコニコ動画、TikTokなどの音楽を再生するよ～")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("動画のURL（YouTube、ニコニコ動画、TikTokなど）")
        .setRequired(true),
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
      const guildId = interaction.guild.id;

      // 対応サイトの検証
      const supportedSites = [
        "youtube.com",
        "youtu.be",
        "m.youtube.com",
        "nicovideo.jp",
        "nico.ms",
        "sp.nicovideo.jp",
        "tiktok.com",
        "vt.tiktok.com",
        "soundcloud.com",
        "m.soundcloud.com",
        "bilibili.com",
        "b23.tv",
      ];

      const isSupported = supportedSites.some((site) => url.includes(site));

      if (!isSupported) {
        return await interaction.reply(
          "対応していないサイトです。YouTube、ニコニコ動画、TikTok、SoundCloudなどのURLを入力してね！",
        );
      }

      await interaction.reply("音楽を準備中...🎵");

      // TikTokかどうかを判定
      const isTikTok =
        url.includes("tiktok.com") || url.includes("vt.tiktok.com");

      // 修正: より安全な動画情報取得
      let songInfo;
      try {
        songInfo = await this.getVideoInfo(url, isTikTok);
        songInfo.requester = interaction.user.id;
        songInfo.requesterName = interaction.user.displayName;
        songInfo.isTikTok = isTikTok;

        await this.addToQueueAndPlay(interaction, voiceChannel, songInfo);
      } catch (infoError) {
        console.error("動画情報取得エラー:", infoError);

        // フォールバック: 基本的な情報で試行
        const fallbackInfo = {
          url,
          title: isTikTok ? "TikTok動画" : "動画",
          thumbnail: null,
          duration: null,
          uploader: isTikTok ? "TikTokユーザー" : "不明",
          requester: interaction.user.id,
          requesterName: interaction.user.displayName,
          isTikTok,
        };

        console.log("フォールバック情報で再試行します");
        await this.addToQueueAndPlay(interaction, voiceChannel, fallbackInfo);
      }
    } catch (error) {
      console.error("音楽再生エラー:", error);

      let errorMessage = "音楽の再生中にエラーが発生しました。";

      if (error.message.includes("This content isn't available")) {
        errorMessage =
          "この動画は現在利用できません。削除されたか、地域制限がある可能性があります。";
      } else if (error.message.includes("タイムアウト")) {
        errorMessage =
          "動画の読み込みに時間がかかりすぎています。別のURLを試してください。";
      } else if (error.message.includes("Video unavailable")) {
        errorMessage = "この動画は利用できません。別のURLを試してください。";
      } else if (error.message.includes("Private video")) {
        errorMessage = "プライベート動画は再生できません。";
      }

      try {
        await interaction.editReply(errorMessage);
      } catch (replyError) {
        console.error("リプライエラー:", replyError);
      }
    }
  },

  // 修正: 最小限の安全なオプションを使用
  async getVideoInfo(url, isTikTok) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`動画情報取得試行 ${attempt}/${maxRetries}`);

        // 最小限のオプションで試行
        const options = {
          dumpSingleJson: true,
          noWarnings: true,
          ignoreErrors: true,
        };

        // TikTokの場合のみ追加オプション
        if (isTikTok) {
          options.addHeader = [
            "User-Agent:Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
          ];
        }

        // タイムアウトを設定
        const timeout = isTikTok ? 20000 : 30000;
        const info = await Promise.race([
          youtubedl(url, options),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("動画情報取得タイムアウト")),
              timeout,
            ),
          ),
        ]);

        if (!info) {
          throw new Error("動画情報を取得できませんでした");
        }

        const title =
          info.title ||
          info.description?.slice(0, 100) ||
          (isTikTok ? "TikTok動画" : "動画");
        const thumbnail =
          info.thumbnail ||
          (info.thumbnails && info.thumbnails.length > 0
            ? info.thumbnails[0].url
            : null);
        const duration = info.duration ? Math.floor(info.duration) : null;
        const uploader =
          info.uploader ||
          info.channel ||
          info.uploader_id ||
          (isTikTok ? "TikTokユーザー" : "不明");

        return {
          url,
          title,
          thumbnail,
          duration,
          uploader,
        };
      } catch (error) {
        lastError = error;
        console.error(`試行 ${attempt} 失敗:`, error.message);

        if (attempt < maxRetries) {
          // 再試行前に少し待機
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    throw new Error(
      `動画情報の取得に失敗しました (${maxRetries}回試行): ${lastError}`,
    );
  },

  async addToQueueAndPlay(interaction, voiceChannel, songInfo) {
    const guildId = interaction.guild.id;

    // キューの初期化
    if (!global.musicQueues.has(guildId)) {
      global.musicQueues.set(guildId, []);
    }

    const queue = global.musicQueues.get(guildId);
    const isPlaying =
      global.musicPlayers.has(guildId) &&
      global.musicPlayers.get(guildId).state.status ===
      AudioPlayerStatus.Playing;

    // キューに追加
    queue.push(songInfo);

    if (isPlaying) {
      // 既に再生中の場合はキューに追加のみ
      const embed = new EmbedBuilder()
        .setTitle("🎵 キューに追加されました")
        .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
        .setColor(0x0099ff)
        .addFields(
          { name: "投稿者", value: songInfo.uploader, inline: true },
          {
            name: "リクエスト者",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: "キュー位置", value: `${queue.length}番目`, inline: true },
        )
        .setFooter({
          text: `キューに${queue.length}曲待機中`,
        });

      if (songInfo.thumbnail) {
        embed.setThumbnail(songInfo.thumbnail);
      }

      if (songInfo.duration) {
        const minutes = Math.floor(songInfo.duration / 60);
        const seconds = songInfo.duration % 60;
        embed.addFields({
          name: "再生時間",
          value: `${minutes}:${seconds.toString().padStart(2, "0")}`,
          inline: true,
        });
      }

      await interaction.editReply({ content: null, embeds: [embed] });
    } else {
      // 初回再生または再生停止中の場合
      await this.playNextSong(interaction, voiceChannel);
    }
  },

  async playNextSong(interaction, voiceChannel) {
    const guildId = interaction.guild.id;
    const queue = global.musicQueues.get(guildId);

    if (!queue || queue.length === 0) {
      return;
    }

    const songInfo = queue.shift();

    try {
      // ボイスチャンネルに接続
      let connection = global.musicConnections.get(guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });
        global.musicConnections.set(guildId, connection);
      }

      // 修正: より安全なストリーミング方式
      const execOptions = {
  output: "-",
  format: "bestaudio",
};

if (cookieFile) {
  execOptions.cookies = cookieFile;
}

const streamProcess = youtubedl.exec(url, execOptions);
const stream = streamProcess.stdout;

      const resource = createAudioResource(stream, {
        inputType: "arbitrary",
        inlineVolume: false,
        metadata: {
          title: songInfo.title,
          songInfo: songInfo,
        },
      });

      // オーディオプレイヤーを作成または取得
      let player = global.musicPlayers.get(guildId);
      if (!player) {
        player = createAudioPlayer();
        global.musicPlayers.set(guildId, player);

        // プレイヤーのイベントリスナー
        player.on(AudioPlayerStatus.Playing, () => {
          console.log("音楽を再生中...");
        });

        player.on(AudioPlayerStatus.Idle, () => {
          console.log("音楽の再生が終了しました");
          setTimeout(() => {
            this.playNextSong(interaction, voiceChannel);
          }, 1000);
        });

        player.on("error", (error) => {
          console.error("プレイヤーエラー:", error);
          setTimeout(() => {
            const currentQueue = global.musicQueues.get(guildId);
            if (currentQueue && currentQueue.length > 0) {
              this.playNextSong(interaction, voiceChannel);
            }
          }, 2000);
        });
      }

      connection.subscribe(player);

      // 現在再生中の曲情報を保存
      if (!global.currentSongs) {
        global.currentSongs = new Map();
      }
      global.currentSongs.set(guildId, songInfo);

      player.play(resource);

      // 再生開始メッセージを送信
      const embed = new EmbedBuilder()
        .setTitle("🎵 現在再生中")
        .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
        .setColor(0x00ff00)
        .addFields(
          { name: "投稿者", value: songInfo.uploader, inline: true },
          {
            name: "リクエスト者",
            value: `<@${songInfo.requester}>`,
            inline: true,
          },
          { name: "チャンネル", value: `<#${voiceChannel.id}>`, inline: true },
        )
        .setFooter({
          text: `キューに${queue.length}曲待機中`,
        });

      if (songInfo.thumbnail) {
        embed.setThumbnail(songInfo.thumbnail);
      }

      if (songInfo.duration) {
        const minutes = Math.floor(songInfo.duration / 60);
        const seconds = songInfo.duration % 60;
        embed.addFields({
          name: "再生時間",
          value: `${minutes}:${seconds.toString().padStart(2, "0")}`,
          inline: true,
        });
      }

      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      console.error("再生エラー:", error);

      let errorMessage = `「${songInfo.title}」の再生に失敗しました。次の曲をスキップします。`;

      try {
        const errorEmbed = new EmbedBuilder()
          .setTitle("⚠️ 再生エラー")
          .setDescription(errorMessage)
          .setColor(0xff0000);

        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } catch (followUpError) {
        console.error("フォローアップエラー:", followUpError);
      }

      // 次の曲を再生
      setTimeout(() => {
        const currentQueue = global.musicQueues.get(guildId);
        if (currentQueue && currentQueue.length > 0) {
          this.playNextSong(interaction, voiceChannel);
        }
      }, 2000);
    }
  },

  // 修正: Render環境に最適化されたストリーミング
  async createAudioStream(songInfo) {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`ストリーム作成試行 ${attempt}/${maxRetries}`);

        let streamOptions = {
          output: "-", // stdoutに出力
          noWarnings: true,
          ignoreErrors: true,
        };

        if (songInfo.isTikTok) {
          streamOptions.format = "best[height<=480]/best";
          streamOptions.addHeader = [
            "User-Agent:Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
          ];
        } else {
          streamOptions.format = "bestaudio/best";
        }

        const timeout = songInfo.isTikTok ? 25000 : 35000;

        const process = youtubedl.exec(songInfo.url, streamOptions);

        return await Promise.race([
          new Promise((resolve, reject) => {
            // 成功時に stdout（ストリーム）を渡す
            resolve(process.stdout);
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("ストリーム作成タイムアウト")), timeout)
          ),
        ]);
      } catch (error) {
        lastError = error;
        console.error(`ストリーム作成試行 ${attempt} 失敗:`, error.message);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    throw new Error(`ストリーム作成に失敗しました: ${lastError.message}`);
  }

};

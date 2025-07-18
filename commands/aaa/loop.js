const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { AudioPlayerStatus } = require("@discordjs/voice");

// グローバルなループ状態管理
if (!global.loopStates) {
  global.loopStates = new Map();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("現在再生中の曲をループ再生します")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("ループモード")
        .setRequired(false)
        .addChoices(
          { name: "オン", value: "on" },
          { name: "オフ", value: "off" },
          { name: "状態確認", value: "status" },
        ),
    ),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const mode = interaction.options.getString("mode") || "toggle";

      // プレイヤーが存在するかチェック
      const player = global.musicPlayers?.get(guildId);
      if (!player) {
        return await interaction.reply({
          content: "現在再生中の音楽がありません。",
          ephemeral: true,
        });
      }

      // 現在再生中の曲情報を取得
      const currentSong = global.currentSongs?.get(guildId);
      if (!currentSong) {
        return await interaction.reply({
          content: "現在再生中の曲情報が見つかりません。",
          ephemeral: true,
        });
      }

      // 権限チェック
      const canLoop = await this.checkLoopPermission(interaction, userId);

      if (!canLoop) {
        return await interaction.reply({
          content:
            "ループ設定する権限がありません。管理者のみループ設定できます。",
          ephemeral: true,
        });
      }

      // 現在のループ状態を取得
      const currentLoopState = global.loopStates.get(guildId) || false;

      let newLoopState;
      let action;

      switch (mode) {
        case "on":
          newLoopState = true;
          action = "オンにしました";
          break;
        case "off":
          newLoopState = false;
          action = "オフにしました";
          break;
        case "status":
          const embed = new EmbedBuilder()
            .setTitle("🔄 ループ状態")
            .setDescription(
              `現在のループ状態: **${currentLoopState ? "オン" : "オフ"}**`,
            )
            .setColor(currentLoopState ? 0x00ff00 : 0xff0000)
            .addFields({
              name: "現在再生中",
              value: `**${currentSong.title}**`,
              inline: false,
            });

          return await interaction.reply({ embeds: [embed] });
        default:
          // トグル
          newLoopState = !currentLoopState;
          action = newLoopState ? "オンにしました" : "オフにしました";
      }

      // ループ状態を更新
      global.loopStates.set(guildId, newLoopState);

      // 既存のプレイヤーイベントリスナーを削除して新しく設定
      this.setupPlayerEvents(player, guildId, interaction);

      const embed = new EmbedBuilder()
        .setTitle("🔄 ループ設定")
        .setDescription(`**${currentSong.title}** のループを${action}`)
        .setColor(newLoopState ? 0x00ff00 : 0xff0000)
        .addFields(
          { name: "設定実行者", value: `<@${userId}>`, inline: true },
          {
            name: "ループ状態",
            value: newLoopState ? "オン" : "オフ",
            inline: true,
          },
        )
        .setFooter({
          text: newLoopState
            ? "この曲を繰り返し再生します"
            : "通常再生に戻りました",
        });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("ループエラー:", error);
      await interaction.reply({
        content: "ループ設定中にエラーが発生しました。",
        ephemeral: true,
      });
    }
  },

  async checkLoopPermission(interaction, userId) {
    // 1. 管理者権限をチェック
    const member = await interaction.guild.members.fetch(userId);
    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return true;
    }

    // 2. 除外リストをチェック
    const exclusionRoles = global.exclusionRoles?.get(interaction.guild.id);
    if (exclusionRoles && exclusionRoles.loop) {
      const memberRoles = member.roles.cache;
      for (const roleId of exclusionRoles.loop) {
        if (memberRoles.has(roleId)) {
          return true;
        }
      }
    }

    return false;
  },

  setupPlayerEvents(player, guildId, interaction) {
    // 既存のリスナーを削除
    player.removeAllListeners(AudioPlayerStatus.Idle);
    player.removeAllListeners("error");

    // 新しいリスナーを設定
    player.on(AudioPlayerStatus.Idle, () => {
      console.log("音楽の再生が終了しました");

      const isLooping = global.loopStates.get(guildId);

      if (isLooping) {
        // ループ再生
        setTimeout(() => {
          this.replayCurrentSong(guildId, interaction);
        }, 1000);
      } else {
        // 通常の次の曲再生
        setTimeout(() => {
          const playModule = require("./play");
          if (playModule.playNextSong) {
            playModule.playNextSong(
              interaction,
              interaction.member?.voice?.channel,
            );
          }
        }, 1000);
      }
    });

    player.on("error", (error) => {
      console.error("プレイヤーエラー:", error);

      const isLooping = global.loopStates.get(guildId);

      if (isLooping) {
        // ループ中のエラー時も再試行
        setTimeout(() => {
          this.replayCurrentSong(guildId, interaction);
        }, 2000);
      } else {
        // 通常時は次の曲へ
        setTimeout(() => {
          const playModule = require("./play");
          if (playModule.playNextSong) {
            playModule.playNextSong(
              interaction,
              interaction.member?.voice?.channel,
            );
          }
        }, 2000);
      }
    });
  },

  async replayCurrentSong(guildId, interaction) {
    try {
      const currentSong = global.currentSongs?.get(guildId);
      const player = global.musicPlayers?.get(guildId);
      const connection = global.musicConnections?.get(guildId);

      if (!currentSong || !player || !connection) {
        console.error("ループ再生に必要な情報が不足しています");
        return;
      }

      // 音声ストリームを再作成
      const youtubedl = require("youtube-dl-exec");
      const { createAudioResource } = require("@discordjs/voice");

      let streamOptions;
      if (currentSong.isTikTok) {
        streamOptions = {
          output: "-",
          format: "best[ext=mp4]/best",
          noWarnings: true,
          noCallHome: true,
          noCheckCertificate: true,
          noPlaylist: true,
          ignoreErrors: true,
          extractFlat: false,
          writeInfoJson: false,
        };
      } else {
        streamOptions = {
          output: "-",
          format: "bestaudio/best",
          audioFormat: "wav",
          audioQuality: "0",
          noWarnings: true,
          noCallHome: true,
          noCheckCertificate: true,
          noPlaylist: true,
          preferFreeFormats: true,
          ignoreErrors: true,
        };
      }

      const stream = youtubedl.exec(currentSong.url, streamOptions);
      const resource = createAudioResource(stream.stdout, {
        inputType: "arbitrary",
        inlineVolume: false,
        metadata: {
          title: currentSong.title,
          songInfo: currentSong,
        },
      });

      player.play(resource);

      console.log(`ループ再生: ${currentSong.title}`);
    } catch (error) {
      console.error("ループ再生エラー:", error);
      // エラー時はループを停止
      global.loopStates.set(guildId, false);
    }
  },
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { AudioPlayerStatus } = require("@discordjs/voice");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在再生中の曲をスキップします"),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      // プレイヤーが存在するかチェック
      const player = global.musicPlayers?.get(guildId);
      if (!player || player.state.status !== AudioPlayerStatus.Playing) {
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
      const canSkip = await this.checkSkipPermission(
        interaction,
        userId,
        currentSong.requester,
      );

      if (!canSkip) {
        return await interaction.reply({
          content:
            "スキップする権限がありません。曲を追加した人または管理者のみスキップできます。",
          ephemeral: true,
        });
      }

      // スキップ実行
      player.stop();

      const embed = new EmbedBuilder()
        .setTitle("⏭️ スキップしました")
        .setDescription(`**${currentSong.title}** をスキップしました`)
        .setColor(0xff9900)
        .addFields({
          name: "スキップ実行者",
          value: `<@${userId}>`,
          inline: true,
        })
        .setFooter({
          text: "次の曲を再生します...",
        });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("スキップエラー:", error);
      await interaction.reply({
        content: "スキップ中にエラーが発生しました。",
        ephemeral: true,
      });
    }
  },

  async checkSkipPermission(interaction, userId, requester) {
    // 1. 曲を追加した人かチェック
    if (userId === requester) {
      return true;
    }

    // 2. 管理者権限をチェック
    const member = await interaction.guild.members.fetch(userId);
    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return true;
    }

    // 3. 除外リストをチェック
    const exclusionRoles = global.exclusionRoles?.get(interaction.guild.id);
    if (exclusionRoles && exclusionRoles.skip) {
      const memberRoles = member.roles.cache;
      for (const roleId of exclusionRoles.skip) {
        if (memberRoles.has(roleId)) {
          return true;
        }
      }
    }

    return false;
  },
};

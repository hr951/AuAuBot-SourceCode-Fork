
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute_raid")
    .setDescription("RaidGuard_AuAuロールを全員から剥奪します")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    await interaction.deferReply();

    try {
      // RaidGuard_AuAuロールを検索
      const raidGuardRole = interaction.guild.roles.cache.find(
        (role) => role.name === "RaidGuard_AuAu"
      );

      if (!raidGuardRole) {
        await interaction.editReply("RaidGuard_AuAuロールが見つかりません。");
        return;
      }

      // RaidGuard_AuAuロールを持つメンバーを取得
      const membersWithRole = raidGuardRole.members;

      if (membersWithRole.size === 0) {
        await interaction.editReply("RaidGuard_AuAuロールを持つメンバーはいません。");
        return;
      }

      let successCount = 0;
      let failCount = 0;

      // 各メンバーからロールを剥奪
      for (const [, member] of membersWithRole) {
        try {
          await member.roles.remove(raidGuardRole);
          successCount++;
          console.log(`${member.user.username} からRaidGuard_AuAuロールを剥奪しました`);
        } catch (error) {
          failCount++;
          console.error(`${member.user.username} からのロール剥奪に失敗:`, error);
        }
      }

      await interaction.editReply(
        `✅ レイドミュートを解除しました！\n` +
        `成功: ${successCount}人\n` +
        `失敗: ${failCount}人\n` +
        `RaidGuard_AuAuロールを全員から剥奪しました。`
      );

    } catch (error) {
      console.error("unmute_raidコマンドでエラーが発生しました:", error);
      await interaction.editReply("コマンドの実行中にエラーが発生しました。");
    }
  },
};

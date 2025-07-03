const { SlashCommandBuilder } = require("discord.js");

// 荒らしサーバーのIDリスト (ここに実際のサーバーIDを登録してください)
// 例: ["123456789012345678", "987654321098765432"]
const ARASHI_GUILD_IDS = ["1363182059278831797"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("arashi_user")
    .setDescription("荒らしサーバーに入ってる人を確認するよー"),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); // 長い処理のために遅延応答

    const arashiUsers = new Map(); // 荒らしサーバーに入っているユーザーを格納するMap

    // 全ての荒らしサーバーIDをループ
    for (const guildId of ARASHI_GUILD_IDS) {
      try {
        const guild = interaction.client.guilds.cache.get(guildId);
        if (!guild) {
          console.log(`[arashi_user] ギルドID ${guildId} が見つからないよ！`);
          continue; // ギルドが見つからない場合はスキップ
        }

        // ギルドのメンバーをフェッチ (GUILD_MEMBERS インテントが必要)
        const members = await guild.members.fetch();

        members.forEach((member) => {
          // ボット自身はリストに含めない
          if (member.user.bot) return;

          // すでに登録されているユーザーであれば、そのサーバーIDを追加
          if (arashiUsers.has(member.id)) {
            const existingInfo = arashiUsers.get(member.id);
            existingInfo.guilds.push(guild.name);
          } else {
            // 新しいユーザーであれば、情報をMapに追加
            arashiUsers.set(member.id, {
              username: member.user.username,
              globalName: member.user.globalName, // 新しいユーザー名
              displayName: member.displayName, // サーバーニックネーム
              guilds: [guild.name],
            });
          }
        });
      } catch (error) {
        console.error(
          `[arashi_user] ギルド ${guildId} のメンバー取得中にエラーが出ちゃったみたい:`,
          error,
        );
        // エラーが発生しても処理を続行
      }
    }

    let replyMessage = "";
    if (arashiUsers.size === 0) {
      replyMessage =
        "[やったね]荒らしサーバーに入っているユーザーはいなかったよ！";
    } else {
      replyMessage = `:warning:[危険かも]荒らしサーバーに入っているユーザーだよ:\n`;
      arashiUsers.forEach((userInfo) => {
        const displayUserName = userInfo.globalName || userInfo.username; // globalName優先
        const displayNickName =
          userInfo.displayName && userInfo.displayName !== displayUserName
            ? ` (${userInfo.displayName})`
            : "";
        replyMessage += `- ${displayUserName}${displayNickName} が以下のサーバーにいるよ: ${userInfo.guilds.join(", ")}\n`;
      });
    }

    // メッセージが長すぎる場合は分割して送信する
    if (replyMessage.length > 2000) {
      const chunks = replyMessage.match(/(.|\n){1,1900}/g); // 1900文字ごとに分割
      for (const chunk of chunks) {
        await interaction.followUp({ content: chunk, ephemeral: true });
      }
      await interaction.editReply({
        content: "結果が長すぎちゃったから分割して送ったよ！",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({ content: replyMessage, ephemeral: true });
    }
  },
};

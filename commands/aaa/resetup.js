
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("resetup")
        .setDescription("ロールとチャンネルを再セットアップします")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const guild = interaction.guild;

            // auau-logチャンネルを作成または確認
            let logChannel = guild.channels.cache.find(
                (channel) =>
                    channel.name === "auau-log" &&
                    channel.type === ChannelType.GuildText,
            );

            if (!logChannel) {
                logChannel = await guild.channels.create({
                    name: "auau-log",
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone,
                            deny: ["ViewChannel"],
                        },
                        {
                            id: interaction.client.user.id,
                            allow: ["ViewChannel", "SendMessages"],
                        },
                    ],
                    reason: "resetupコマンド - ログチャンネル再作成",
                });
                console.log(`auau-logチャンネルを作成しました`);
            }

            // Muted_AuAuロールを作成または確認
            let muteRole = guild.roles.cache.find(
                (role) => role.name === "Muted_AuAu",
            );
            if (!muteRole) {
                muteRole = await guild.roles.create({
                    name: "Muted_AuAu",
                    color: "#808080",
                    reason: "resetupコマンド - ミュートロール再作成",
                });
                console.log(`Muted_AuAuロールを作成しました`);
            }

            // RaidGuard_AuAuロールを作成または確認
            let raidGuardRole = guild.roles.cache.find(
                (role) => role.name === "RaidGuard_AuAu",
            );
            if (!raidGuardRole) {
                raidGuardRole = await guild.roles.create({
                    name: "RaidGuard_AuAu",
                    color: "#FF0000",
                    reason: "resetupコマンド - レイドガードロール再作成",
                });
                console.log(`RaidGuard_AuAuロールを作成しました`);
            }

            // 権限設定のために少し待機
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // 全チャンネルに対してロールの権限を設定
            const channels = guild.channels.cache.filter(
                (channel) =>
                    channel.type === ChannelType.GuildText ||
                    channel.type === ChannelType.GuildVoice,
            );

            let successCount = 0;
            let skipCount = 0;
            let errorCount = 0;

            for (const [, channel] of channels) {
                try {
                    // Botがチャンネルの権限を管理できるかチェック
                    const botMember = guild.members.cache.get(interaction.client.user.id);
                    if (
                        !channel
                            .permissionsFor(botMember)
                            .has(["ManageRoles", "ManageChannels"])
                    ) {
                        console.log(
                            `チャンネル ${channel.name} の権限設定をスキップ: 権限不足`,
                        );
                        skipCount++;
                        continue;
                    }

                    // Muted_AuAuロールの権限設定
                    await channel.permissionOverwrites.create(muteRole, {
                        SendMessages: false,
                        Speak: false,
                        AddReactions: false,
                        SendMessagesInThreads: false,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false,
                    });

                    // RaidGuard_AuAuロールの権限設定
                    await channel.permissionOverwrites.create(raidGuardRole, {
                        SendMessages: false,
                        AddReactions: false,
                        SendMessagesInThreads: false,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false,
                    });

                    console.log(`チャンネル ${channel.name} の権限設定完了`);
                    successCount++;

                    // レート制限を避けるため少し待機
                    await new Promise((resolve) => setTimeout(resolve, 200));
                } catch (error) {
                    if (error.code === 50001 || error.code === 50013) {
                        console.log(
                            `チャンネル ${channel.name} の権限設定をスキップ: ${error.message}`,
                        );
                        skipCount++;
                    } else {
                        console.error(
                            `チャンネル ${channel.name} の権限設定に失敗:`,
                            error,
                        );
                        errorCount++;
                    }
                }
            }

            await interaction.editReply(
                `✅ **セットアップが完了しました！**\n\n` +
                `📝 **作成・確認されたもの:**\n` +
                `• auau-logチャンネル\n` +
                `• Muted_AuAuロール\n` +
                `• RaidGuard_AuAuロール\n\n` +
                `🔧 **チャンネル権限設定結果:**\n` +
                `• 成功: ${successCount}チャンネル\n` +
                `• スキップ: ${skipCount}チャンネル\n` +
                `• エラー: ${errorCount}チャンネル\n\n` +
                `${skipCount > 0 ? "⚠️ 一部のチャンネルで権限不足のためスキップされました。Botのロール順位を確認してください。" : ""}`,
            );

            // ログチャンネルにも通知を送信
            await logChannel.send(
                `🔄 **セットアップが再実行されました**\n` +
                `実行者: ${interaction.user.tag}\n` +
                `時刻: ${new Date().toLocaleString('ja-JP')}\n` +
                `結果: 成功 ${successCount}, スキップ ${skipCount}, エラー ${errorCount}`,
            );

        } catch (error) {
            console.error("resetupコマンドでエラーが発生しました:", error);
            await interaction.editReply(
                "❌ セットアップ中にエラーが発生しました。コンソールログを確認してください。",
            );
        }
    },
};

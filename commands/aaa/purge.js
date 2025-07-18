const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionsBitField,
} = require("discord.js");

// 認証されたユーザーのIDリスト（サーバー外のユーザーも含む）
const AUTHORIZED_USERS = [
    "123456789012345678", // 認証されたユーザーID1
    "987654321098765432", // 認証されたユーザーID2
    // 必要に応じて追加
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("メッセージを削除するコマンド")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("messages")
                .setDescription("指定した数のメッセージを削除")
                .addIntegerOption((option) =>
                    option
                        .setName("amount")
                        .setDescription("削除するメッセージ数（1-100）")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("user")
                .setDescription("特定のユーザーのメッセージを削除")
                .addStringOption((option) =>
                    option
                        .setName("userid")
                        .setDescription("削除対象のユーザーID")
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("amount")
                        .setDescription("削除するメッセージ数（1-100）")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add_auth")
                .setDescription("認証ユーザーを追加（管理者限定）")
                .addStringOption((option) =>
                    option
                        .setName("userid")
                        .setDescription("追加するユーザーID")
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove_auth")
                .setDescription("認証ユーザーを削除（管理者限定）")
                .addStringOption((option) =>
                    option
                        .setName("userid")
                        .setDescription("削除するユーザーID")
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list_auth")
                .setDescription("認証ユーザーリストを表示（管理者限定）"),
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "messages":
                await handlePurgeMessages(interaction);
                break;
            case "user":
                await handlePurgeUser(interaction);
                break;
            case "add_auth":
                await handleAddAuth(interaction);
                break;
            case "remove_auth":
                await handleRemoveAuth(interaction);
                break;
            case "list_auth":
                await handleListAuth(interaction);
                break;
            default:
                await interaction.reply({
                    content: "❌ 無効なサブコマンドです。",
                    ephemeral: true,
                });
        }
    },
};

// 基本的なpurgeコマンドの処理
async function handlePurgeMessages(interaction) {
    // 権限チェック
    if (!AUTHORIZED_USERS.includes(interaction.user.id)) {
        await interaction.reply({
            content: "❌ このコマンドを実行する権限がありません。",
            ephemeral: true,
        });
        return;
    }

    // Bot権限チェック
    if (
        !interaction.channel
            .permissionsFor(interaction.guild.members.me)
            .has(PermissionsBitField.Flags.ManageMessages)
    ) {
        await interaction.reply({
            content: "❌ Botにメッセージ管理権限がありません。",
            ephemeral: true,
        });
        return;
    }

    const amount = interaction.options.getInteger("amount");

    try {
        // 確認メッセージを送信
        await interaction.reply({
            content: `⚠️ ${amount}件のメッセージを削除しますか？\n✅ で確認、❌ でキャンセル`,
            ephemeral: false,
        });

        const confirmMsg = await interaction.fetchReply();
        await confirmMsg.react("✅");
        await confirmMsg.react("❌");

        // リアクションを待機
        const filter = (reaction, user) => {
            return (
                ["✅", "❌"].includes(reaction.emoji.name) &&
                user.id === interaction.user.id
            );
        };

        const collected = await confirmMsg.awaitReactions({
            filter,
            max: 1,
            time: 30000,
            errors: ["time"],
        });

        const reaction = collected.first();

        if (reaction.emoji.name === "✅") {
            // 確認メッセージを削除
            await confirmMsg.delete();

            // メッセージを削除
            const fetchedMessages = await interaction.channel.messages.fetch({
                limit: amount + 1,
            });
            const messagesToDelete = fetchedMessages.filter(
                (msg) => msg.id !== confirmMsg.id,
            );

            // 14日以内のメッセージのみ一括削除可能
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const bulkDeletable = messagesToDelete.filter(
                (msg) => msg.createdTimestamp > twoWeeksAgo,
            );
            const individualDeletable = messagesToDelete.filter(
                (msg) => msg.createdTimestamp <= twoWeeksAgo,
            );

            let deletedCount = 0;

            // 一括削除
            if (bulkDeletable.size > 0) {
                await interaction.channel.bulkDelete(bulkDeletable);
                deletedCount += bulkDeletable.size;
            }

            // 個別削除（14日以上古いメッセージ）
            for (const msg of individualDeletable.values()) {
                try {
                    await msg.delete();
                    deletedCount++;
                } catch (error) {
                    console.error("メッセージの削除に失敗:", error);
                }
            }

            // 結果を報告
            const resultMsg = await interaction.channel.send(
                `✅ ${deletedCount}件のメッセージを削除しました。`,
            );

            // 5秒後に結果メッセージも削除
            setTimeout(async () => {
                try {
                    await resultMsg.delete();
                } catch (error) {
                    console.error("結果メッセージの削除に失敗:", error);
                }
            }, 5000);
        } else {
            await interaction.editReply("❌ 削除がキャンセルされました。");
            setTimeout(async () => {
                try {
                    await confirmMsg.delete();
                } catch (error) {
                    console.error("確認メッセージの削除に失敗:", error);
                }
            }, 3000);
        }
    } catch (error) {
        if (error.message === "time") {
            try {
                await interaction.editReply(
                    "⏰ タイムアウトしました。削除がキャンセルされました。",
                );
                const confirmMsg = await interaction.fetchReply();
                setTimeout(async () => {
                    try {
                        await confirmMsg.delete();
                    } catch (deleteError) {
                        console.error(
                            "確認メッセージの削除に失敗:",
                            deleteError,
                        );
                    }
                }, 3000);
            } catch (editError) {
                console.error("メッセージの編集に失敗:", editError);
            }
        } else {
            await interaction.editReply(
                `❌ エラーが発生しました: ${error.message}`,
            );
        }
    }
}

// 特定ユーザーのメッセージを削除する処理
async function handlePurgeUser(interaction) {
    // 権限チェック
    if (!AUTHORIZED_USERS.includes(interaction.user.id)) {
        await interaction.reply({
            content: "❌ このコマンドを実行する権限がありません。",
            ephemeral: true,
        });
        return;
    }

    // Bot権限チェック
    if (
        !interaction.channel
            .permissionsFor(interaction.guild.members.me)
            .has(PermissionsBitField.Flags.ManageMessages)
    ) {
        await interaction.reply({
            content: "❌ Botにメッセージ管理権限がありません。",
            ephemeral: true,
        });
        return;
    }

    const userId = interaction.options.getString("userid");
    const amount = interaction.options.getInteger("amount") || 10;

    try {
        await interaction.deferReply();

        // 特定のユーザーのメッセージを取得
        const fetchedMessages = await interaction.channel.messages.fetch({
            limit: 100,
        });
        const userMessages = fetchedMessages
            .filter((msg) => msg.author.id === userId)
            .first(amount);

        if (userMessages.length === 0) {
            await interaction.editReply(
                "❌ 指定されたユーザーのメッセージが見つかりません。",
            );
            return;
        }

        // メッセージを削除
        let deletedCount = 0;
        for (const msg of userMessages) {
            try {
                await msg.delete();
                deletedCount++;
            } catch (error) {
                console.error("メッセージの削除に失敗:", error);
            }
        }

        // 結果を報告
        await interaction.editReply(
            `✅ ユーザー ID ${userId} の${deletedCount}件のメッセージを削除しました。`,
        );

        // 5秒後に結果メッセージも削除
        setTimeout(async () => {
            try {
                await interaction.deleteReply();
            } catch (error) {
                console.error("結果メッセージの削除に失敗:", error);
            }
        }, 5000);
    } catch (error) {
        await interaction.editReply(
            `❌ エラーが発生しました: ${error.message}`,
        );
    }
}

// 認証ユーザーを追加する処理
async function handleAddAuth(interaction) {
    // 管理者権限チェック
    if (
        !interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator,
        )
    ) {
        await interaction.reply({
            content: "❌ このコマンドは管理者のみ実行できます。",
            ephemeral: true,
        });
        return;
    }

    const userId = interaction.options.getString("userid");

    if (!AUTHORIZED_USERS.includes(userId)) {
        AUTHORIZED_USERS.push(userId);
        await interaction.reply({
            content: `✅ ユーザー ID ${userId} を認証リストに追加しました。`,
            ephemeral: true,
        });
    } else {
        await interaction.reply({
            content: `ℹ️ ユーザー ID ${userId} は既に認証リストに含まれています。`,
            ephemeral: true,
        });
    }
}

// 認証ユーザーを削除する処理
async function handleRemoveAuth(interaction) {
    // 管理者権限チェック
    if (
        !interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator,
        )
    ) {
        await interaction.reply({
            content: "❌ このコマンドは管理者のみ実行できます。",
            ephemeral: true,
        });
        return;
    }

    const userId = interaction.options.getString("userid");
    const index = AUTHORIZED_USERS.indexOf(userId);

    if (index > -1) {
        AUTHORIZED_USERS.splice(index, 1);
        await interaction.reply({
            content: `✅ ユーザー ID ${userId} を認証リストから削除しました。`,
            ephemeral: true,
        });
    } else {
        await interaction.reply({
            content: `ℹ️ ユーザー ID ${userId} は認証リストに含まれていません。`,
            ephemeral: true,
        });
    }
}

// 認証ユーザーリストを表示する処理
async function handleListAuth(interaction) {
    // 管理者権限チェック
    if (
        !interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator,
        )
    ) {
        await interaction.reply({
            content: "❌ このコマンドは管理者のみ実行できます。",
            ephemeral: true,
        });
        return;
    }

    if (AUTHORIZED_USERS.length > 0) {
        const userList = AUTHORIZED_USERS.map((userId) => `• ${userId}`).join(
            "\n",
        );
        const embed = new EmbedBuilder()
            .setTitle("認証ユーザーリスト")
            .setDescription(userList)
            .setColor(0x0099ff);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    } else {
        await interaction.reply({
            content: "ℹ️ 認証ユーザーが登録されていません。",
            ephemeral: true,
        });
    }
}

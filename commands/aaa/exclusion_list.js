const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ComponentType,
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("exclusion_list")
        .setDescription("スパム検知を回避するロールを設定します")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const guild = interaction.guild;

            // 現在の除外リストを取得（グローバル変数から）
            const currentExclusions =
                global.spamExclusionRoles?.get(guild.id) || new Set();

            // サーバーのロール一覧を取得（@everyoneを除外）
            const roles = guild.roles.cache
                .filter((role) => role.name !== "@everyone" && !role.managed)
                .sort((a, b) => b.position - a.position);

            if (roles.size === 0) {
                await interaction.editReply("設定可能なロールがありません。");
                return;
            }

            // 選択メニューのオプションを作成
            const options = roles
                .map((role) => {
                    const isExcluded = currentExclusions.has(role.id);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(role.name)
                        .setDescription(
                            isExcluded
                                ? "現在: スパム検知を回避"
                                : "現在: スパム検知対象",
                        )
                        .setValue(role.id)
                        .setEmoji(isExcluded ? "✅" : "❌");
                })
                .slice(0, 25); // Discord制限により最大25個

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId("spam_exclusion_select")
                .setPlaceholder("スパム検知を回避するロールを選択してください")
                .addOptions(options)
                .setMaxValues(options.length);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const response = await interaction.editReply({
                content:
                    `🛡️ **スパムの検知を回避**\n\n` +
                    `以下からスパム検知を回避するロールを選択してください。\n` +
                    `✅ = 現在スパム検知を回避\n` +
                    `❌ = 現在スパム検知対象\n\n` +
                    `選択したロールの状態が切り替わります。`,
                components: [row],
            });

            // 選択メニューの応答を待機
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000, // 60秒でタイムアウト
            });

            collector.on("collect", async (selectInteraction) => {
                if (selectInteraction.user.id !== interaction.user.id) {
                    await selectInteraction.reply({
                        content: "このメニューを操作する権限がありません。",
                        ephemeral: true,
                    });
                    return;
                }

                const selectedRoleIds = selectInteraction.values;

                // グローバル変数を初期化（存在しない場合）
                if (!global.spamExclusionRoles) {
                    global.spamExclusionRoles = new Map();
                }

                if (!global.spamExclusionRoles.has(guild.id)) {
                    global.spamExclusionRoles.set(guild.id, new Set());
                }

                const exclusionSet = global.spamExclusionRoles.get(guild.id);

                // 選択されたロールの状態を切り替え
                let addedRoles = [];
                let removedRoles = [];

                for (const roleId of selectedRoleIds) {
                    const role = guild.roles.cache.get(roleId);
                    if (!role) continue;

                    if (exclusionSet.has(roleId)) {
                        exclusionSet.delete(roleId);
                        removedRoles.push(role.name);
                    } else {
                        exclusionSet.add(roleId);
                        addedRoles.push(role.name);
                    }
                }

                let resultMessage =
                    "🛡️ **スパム検知除外設定を更新しました**\n\n";

                if (addedRoles.length > 0) {
                    resultMessage += `✅ **スパム検知を回避するロール:**\n${addedRoles.map((name) => `• ${name}`).join("\n")}\n\n`;
                }

                if (removedRoles.length > 0) {
                    resultMessage += `❌ **スパム検知対象に戻されたロール:**\n${removedRoles.map((name) => `• ${name}`).join("\n")}\n\n`;
                }

                const currentExcludedRoles = Array.from(exclusionSet)
                    .map((roleId) => guild.roles.cache.get(roleId))
                    .filter((role) => role)
                    .map((role) => role.name);

                if (currentExcludedRoles.length > 0) {
                    resultMessage += `📋 **現在除外中のロール:**\n${currentExcludedRoles.map((name) => `• ${name}`).join("\n")}`;
                } else {
                    resultMessage += `📋 **現在除外中のロール:** なし`;
                }

                // 設定をJSONファイルに保存
                try {
                    const exclusionPath = "./exclusion_roles.json";
                    let allExclusionData = {};
                    
                    // 既存のファイルを読み込み
                    if (fs.existsSync(exclusionPath)) {
                        allExclusionData = JSON.parse(fs.readFileSync(exclusionPath, "utf-8"));
                    }
                    
                    // 現在のサーバーのデータを更新
                    allExclusionData[guild.id] = Array.from(exclusionSet);
                    
                    // ファイルに保存
                    fs.writeFileSync(exclusionPath, JSON.stringify(allExclusionData, null, 2));
                    
                    console.log(`[exclusion_list] 設定をファイルに保存しました`);
                } catch (error) {
                    console.error(`[exclusion_list] 設定の保存に失敗しました:`, error);
                }

                await selectInteraction.update({
                    content: resultMessage,
                    components: [],
                });

                console.log(
                    `[exclusion_list] ${interaction.user.tag} がスパム検知除外設定を更新しました`,
                );
                console.log(`追加: [${addedRoles.join(", ")}]`);
                console.log(`削除: [${removedRoles.join(", ")}]`);
            });

            collector.on("end", async (collected) => {
                if (collected.size === 0) {
                    await interaction.editReply({
                        content:
                            "⏱️ 時間切れです。もう一度コマンドを実行してください。",
                        components: [],
                    });
                }
            });
        } catch (error) {
            console.error(
                "exclusion_listコマンドでエラーが発生しました:",
                error,
            );
            await interaction.editReply(
                "❌ コマンド実行中にエラーが発生しました。コンソールログを確認してください。",
            );
        }
    },
};

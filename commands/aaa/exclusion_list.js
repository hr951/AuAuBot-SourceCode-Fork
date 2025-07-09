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
        .setDescription("検知を回避するロールを設定します")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const guild = interaction.guild;

            const existingData = global.exclusionRoles || new Map();
            global.exclusionRoles = existingData;

            const current = existingData.get(guild.id) || {
                spam: new Set(),
                profanity: new Set(),
                inmu: new Set(),
            };

            // 全ロール取得
            const roles = guild.roles.cache
                .filter((role) => role.name !== "@everyone" && !role.managed)
                .sort((a, b) => b.position - a.position);

            if (roles.size === 0) {
                await interaction.editReply("設定可能なロールがありません。");
                return;
            }

            const makeOptions = (set, label) =>
                roles.map((role) => {
                    const included = set.has(role.id);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`[${label}] ${role.name}`)
                        .setDescription(included ? "現在: 回避" : "現在: 対象")
                        .setValue(`${label}:${role.id}`)
                        .setEmoji(included ? "✅" : "❌");
                });

            const options = [
                ...makeOptions(current.spam, "spam"),
                ...makeOptions(current.profanity, "profanity"),
                ...makeOptions(current.inmu, "inmu"),
            ].slice(0, 25);

            const menu = new StringSelectMenuBuilder()
                .setCustomId("multi_exclusion_select")
                .setPlaceholder("検知を回避するロールを選択してください")
                .addOptions(options)
                .setMaxValues(options.length);

            const row = new ActionRowBuilder().addComponents(menu);

            const response = await interaction.editReply({
                content:
                    "以下の検知をロールごとに回避設定できます（✅ = 回避中）",
                components: [row],
            });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000,
            });

            collector.on("collect", async (selectInteraction) => {
                if (selectInteraction.user.id !== interaction.user.id) {
                    await selectInteraction.reply({
                        content: "このメニューを操作する権限がありません。",
                        ephemeral: true,
                    });
                    return;
                }

                for (const value of selectInteraction.values) {
                    const [type, roleId] = value.split(":");
                    const set = current[type];
                    if (!set) continue;
                    if (set.has(roleId)) {
                        set.delete(roleId);
                    } else {
                        set.add(roleId);
                    }
                }

                existingData.set(guild.id, current);

                // 保存
                const dataToSave = {};
                for (const [guildId, sets] of existingData.entries()) {
                    dataToSave[guildId] = {
                        spam: Array.from(sets.spam),
                        profanity: Array.from(sets.profanity),
                        inmu: Array.from(sets.inmu),
                    };
                }
                fs.writeFileSync(
                    "./exclusion_roles.json",
                    JSON.stringify(dataToSave, null, 2),
                );

                await selectInteraction.update({
                    content:
                        "設定を更新しました。もう一度実行して確認できます。",
                    components: [],
                });
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
                "❌ コマンド実行中にエラーが発生しました。",
            );
        }
    },
};

require("dotenv").config();
const stringSimilarity = require("string-similarity");
const token = process.env.DISCORD_TOKEN;
const fs = require("node:fs");
const path = require("node:path");

// スパム検知のための設定
const SPAM_THRESHOLD_MESSAGES = 3; // 3メッセージ（テスト用に下げる）
const SPAM_THRESHOLD_TIME_MS = 10000; // 10秒（テスト用に延長）
const SIMILARITY_THRESHOLD = 0.6; // 閾値を下げる（テスト用）
const userMessageHistory = new Map();

// レイド対策のための設定
const RAID_DETECTION_WINDOW = 5 * 60 * 1000; // 5分間のウィンドウ
const RAID_THRESHOLD_MULTIPLIER = 5; // 通常の5倍以上の参加者がいたらレイド判定
const MIN_RAID_MEMBERS = 5; // 最低5人以上の参加者がいないとレイド判定しない
const NORMAL_PERIOD_DAYS = 7; // 過去7日間の平均を「通常」として計算
const joinHistory = new Map(); // サーバーごとの参加履歴

const userMessageData = new Map(); // Mapを使用してユーザーごとのデータを保存
const raidModeStatus = new Map(); // サーバーごとのレイドモード状態を追跡

// レイドモード状態をリセットする関数
function resetRaidMode(guildId) {
    raidModeStatus.delete(guildId);
    console.log(`レイドモード状態をリセットしました - Guild ID: ${guildId}`);
}

// グローバルでアクセスできるようにする
global.resetRaidMode = resetRaidMode;

const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    MessageFlags,
    ChannelType, // ChannelType を追加
} = require("discord.js");

const client = new Client({
    // メッセージの内容を読み取るために GatewayIntentBits.MessageContent が必須です。
    // その他の必要なIntentsも追加しています。
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // これが重要！
        GatewayIntentBits.GuildMembers, // GuildMembers Intent を追加
    ],
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(
                `[あれ] ${filePath}のコマンドには、dataかexecuteのプロパティがないんだってさ。`,
            );
        }
    }
}

const homo_words = [
    "野獣先輩",
    "やじゅうせんぱい",
    "Beast Senpai",
    "beast senpai",
    "beast",
    "Beast",
    "野獣",
    "やじゅう",
    "ホモ",
];

const soudayo = [
    "そうなの",
    "そうなん",
    "そうだよ",
    "そっかぁ",
    "そういうこと",
    "そうかも",
    "そうか",
    "そうっすね",
    "そうやで",
];

const abunai_words = [
    "死ね",
    "消えろ",
    "殺す",
    "殺して",
    "殺してやる",
    "障害者",
    "ガイジ",
    "がいじ",
    "知的障害",
    "しね",
    "きえろ",
    "ころす",
    "ころして",
    "ころしてやる",
    "しょうがいしゃ",
    "ちてきしょうがい",
    "!kiken",
];

// ここに危険なBotのIDを追加
const DANGEROUS_BOT_IDS = [
    "1363066479100170330", // 例: '123456789012345678'
    "1286667959397515355",
    "1371866834818826380",
    "1321414173602746419",
    "1349568375839264870",
    "1352599521032540190",
    "1378391189576876174",
    "1336633477868683305",
    "1352779479302410260",
    "1379825654035648555",
    "1386680498537107666",
    // 必要に応じてさらに追加
];

// 通常の参加者ペースを計算する関数
function calculateNormalJoinRate(guildId) {
    const history = joinHistory.get(guildId) || [];
    const now = Date.now();
    const normalPeriodStart = now - NORMAL_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    // 過去7日間の参加者を抽出
    const normalPeriodJoins = history.filter(
        (timestamp) => timestamp >= normalPeriodStart,
    );

    if (normalPeriodJoins.length === 0) {
        return 0; // 過去7日間に参加者がいない場合は0
    }

    // 1時間あたりの平均参加者数を計算
    const hoursInPeriod = (now - normalPeriodStart) / (60 * 60 * 1000);
    const avgJoinsPerHour = normalPeriodJoins.length / hoursInPeriod;

    // 5分間あたりの平均参加者数に変換
    return avgJoinsPerHour * (5 / 60);
}

// レイド検知関数
async function checkForRaid(guild) {
    const guildId = guild.id;
    const history = joinHistory.get(guildId) || [];
    const now = Date.now();
    const windowStart = now - RAID_DETECTION_WINDOW;

    // 過去5分間の参加者数を計算
    const recentJoins = history.filter((timestamp) => timestamp >= windowStart);
    const recentJoinCount = recentJoins.length;

    // 通常の参加者ペースを計算
    const normalRate = calculateNormalJoinRate(guildId);
    const threshold = Math.max(
        normalRate * RAID_THRESHOLD_MULTIPLIER,
        MIN_RAID_MEMBERS,
    );

    console.log(`レイド検知チェック - サーバー: ${guild.name}`);
    console.log(`過去5分間の参加者数: ${recentJoinCount}`);
    console.log(`通常の5分間参加者数: ${normalRate.toFixed(2)}`);
    console.log(`レイド判定閾値: ${threshold.toFixed(2)}`);

    if (recentJoinCount >= threshold) {
        console.log(`レイド検知！ サーバー: ${guild.name}`);
        await activateRaidMode(guild);
    }
}

// レイドモード有効化関数
async function activateRaidMode(guild) {
    try {
        const guildId = guild.id;

        // 既にレイドモードが有効になっているかチェック
        if (raidModeStatus.get(guildId)) {
            console.log(`レイドモードは既に有効です - サーバー: ${guild.name}`);
            return;
        }

        // RaidGuard_AuAuロールを取得または作成
        let raidGuardRole = guild.roles.cache.find(
            (role) => role.name === "RaidGuard_AuAu",
        );

        const isNewRaidMode = !raidGuardRole;

        if (!raidGuardRole) {
            raidGuardRole = await guild.roles.create({
                name: "RaidGuard_AuAu",
                color: "#FF0000", // 赤色
                reason: "レイド対策用制限ロール",
            });
            console.log(`RaidGuard_AuAuロールを作成しました`);

            // 全チャンネルに対してレイドガードロールの権限を設定
            guild.channels.cache.forEach(async (channel) => {
                if (
                    channel.type === ChannelType.GuildText ||
                    channel.type === ChannelType.GuildVoice
                ) {
                    try {
                        await channel.permissionOverwrites.create(
                            raidGuardRole,
                            {
                                SendMessages: false,
                                AddReactions: false,
                                SendMessagesInThreads: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false,
                            },
                        );
                    } catch (error) {
                        console.error(
                            `チャンネル ${channel.name} の権限設定に失敗:`,
                            error,
                        );
                    }
                }
            });
        }

        // レイドモードを有効状態に設定
        raidModeStatus.set(guildId, true);

        // 新規参加者にロールを付与（過去5分間に参加したメンバー）
        const now = Date.now();
        const recentJoinThreshold = now - RAID_DETECTION_WINDOW;

        const recentMembers = guild.members.cache.filter(
            (member) =>
                member.joinedTimestamp >= recentJoinThreshold &&
                !member.user.bot &&
                !member.roles.cache.has(raidGuardRole.id),
        );

        for (const [, member] of recentMembers) {
            try {
                await member.roles.add(raidGuardRole);
                console.log(
                    `${member.user.username} にRaidGuard_AuAuロールを付与しました`,
                );
            } catch (error) {
                console.error(
                    `${member.user.username} へのロール付与に失敗:`,
                    error,
                );
            }
        }

        // 新しいレイドモードの場合のみログメッセージを送信
        if (isNewRaidMode) {
            // ログチャンネルを見つけるか作成する
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
                            id: client.user.id,
                            allow: ["ViewChannel", "SendMessages"],
                        },
                    ],
                    reason: "レイド対策ログ用チャンネルを作成",
                });
                console.log(`auau-log チャンネルを作成しました。`);
            }

            // ログメッセージを送信
            await logChannel.send(
                `⚠️ **異常な参加ペースを検知しました！**\n` +
                    `現在、いつもより明らかに早いスピードで新規メンバーが参加しています。\n` +
                    `あなたのサーバーが **Raidの標的**になっている可能性があります。\n` +
                    `🛡️ セキュリティモードを自動で有効化し、**新規メンバー全員に \`RaidGuard_AuAu\` ロール**を付与しました。\n` +
                    `**対応方法：**\n` +
                    `- 様子を見て問題が落ち着いたら \`/unmute_raid\` コマンドを実行してください。\n` +
                    `- それまでは新規参加者を**慎重に監視**してください。\n` +
                    `- ❇️落ち着くことも重要です。 冷静な判断を下すためにアイスティーを飲みながら警戒するのをおすすめします。\n` +
                    `*（by あうあうBot）*`,
            );
        }
    } catch (error) {
        console.error("レイドモード有効化中にエラーが発生しました:", error);
    }
}

client.on("ready", () => {
    console.log(`${client.user.tag}でログインしました!!`);
});

// Botがサーバーに参加したときのイベント
client.on(Events.GuildCreate, async (guild) => {
    try {
        console.log(`新しいサーバーに参加しました: ${guild.name}`);

        // auau-logチャンネルを作成
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
                        id: client.user.id,
                        allow: ["ViewChannel", "SendMessages"],
                    },
                ],
                reason: "あうあうBot初期化 - ログチャンネル作成",
            });
            console.log(`auau-logチャンネルを作成しました`);
        }

        // Muted_AuAuロールを作成
        let muteRole = guild.roles.cache.find(
            (role) => role.name === "Muted_AuAu",
        );
        if (!muteRole) {
            muteRole = await guild.roles.create({
                name: "Muted_AuAu",
                color: "#808080",
                reason: "あうあうBot初期化 - ミュートロール作成",
            });
            console.log(`Muted_AuAuロールを作成しました`);
        }

        // RaidGuard_AuAuロールを作成
        let raidGuardRole = guild.roles.cache.find(
            (role) => role.name === "RaidGuard_AuAu",
        );
        if (!raidGuardRole) {
            raidGuardRole = await guild.roles.create({
                name: "RaidGuard_AuAu",
                color: "#FF0000",
                reason: "あうあうBot初期化 - レイドガードロール作成",
            });
            console.log(`RaidGuard_AuAuロールを作成しました`);
        }

        // 権限設定のために少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 全チャンネルに対してロールの権限を設定
        const channels = guild.channels.cache.filter(
            channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice
        );

        for (const [, channel] of channels) {
            try {
                // Botがチャンネルの権限を管理できるかチェック
                const botMember = guild.members.cache.get(client.user.id);
                if (!channel.permissionsFor(botMember).has(['ManageRoles', 'ManageChannels'])) {
                    console.log(`チャンネル ${channel.name} の権限設定をスキップ: 権限不足`);
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
                
                // レート制限を避けるため少し待機
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                if (error.code === 50001 || error.code === 50013) {
                    console.log(`チャンネル ${channel.name} の権限設定をスキップ: ${error.message}`);
                } else {
                    console.error(`チャンネル ${channel.name} の権限設定に失敗:`, error);
                }
            }
        }

        // ウェルカムメッセージを送信
        await logChannel.send({
            content:
                `やあ！屋上あんだけど…焼いてかない...？\n` +
                `Botの導入ありがとうございます、あうあうBotのロールの順位をなるべく高くして、\n` +
                `その下にRaidGuard_AuAuロール、Muted_AuAuロールを設置してください`,
            files: ["https://i.imgur.com/hoaV8id.gif"],
        });

        console.log(`${guild.name} への初期化が完了しました`);
    } catch (error) {
        console.error(
            "サーバー参加時の初期化処理でエラーが発生しました:",
            error,
        );
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(
            `${interaction.commandName}に一致するコマンドが見つかんなかったよ。`,
        );
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: "コマンド実行してるときにエラー出たんだってさ。",
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: "コマンド実行してるときにエラー出たんだってさ。",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
});

// 新しいメンバーがサーバーに参加したときのイベント
client.on(Events.GuildMemberAdd, async (member) => {
    const guildId = member.guild.id;
    const now = Date.now();

    // 参加履歴を記録
    if (!joinHistory.has(guildId)) {
        joinHistory.set(guildId, []);
    }

    const history = joinHistory.get(guildId);
    history.push(now);

    // 古い履歴を削除（7日より古いものを削除）
    const sevenDaysAgo = now - NORMAL_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const cleanHistory = history.filter(
        (timestamp) => timestamp >= sevenDaysAgo,
    );
    joinHistory.set(guildId, cleanHistory);

    // 参加したのがBotかどうかをチェック
    if (member.user.bot) {
        // そのBotが危険なBotリストに含まれているかをチェック
        if (DANGEROUS_BOT_IDS.includes(member.user.id)) {
            try {
                // Botを即座にBANする
                await member.ban({ reason: "危険なBotのため自動BAN" });
                console.log(
                    `危険なBot ${member.user.tag} (${member.user.id}) をBANしました。`,
                );

                // ログチャンネルを見つけるか作成する
                let logChannel = member.guild.channels.cache.find(
                    (channel) =>
                        channel.name === "auau-log" &&
                        channel.type === ChannelType.GuildText,
                );

                if (!logChannel) {
                    // auau-log チャンネルが存在しない場合、プライベートチャンネルとして作成
                    logChannel = await member.guild.channels.create({
                        name: "auau-log",
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: member.guild.roles.everyone,
                                deny: ["ViewChannel"], // @everyone からは隠す
                            },
                            {
                                id: client.user.id, // ボット自身は閲覧可能にする
                                allow: ["ViewChannel", "SendMessages"],
                            },
                            // 必要に応じて管理者ロールなどを追加することも可能
                        ],
                        reason: "危険なBotのログ用チャンネルを作成",
                    });
                    console.log(`auau-log チャンネルを作成しました。`);
                }

                // ログチャンネルに通知を送信
                await logChannel.send(
                    `:rotating_light: **危険なBot検知 & BAN** :rotating_light:\n` +
                        `Botの名前: ${member.user.tag}\n` +
                        `BotのID: \`${member.user.id}\`\n` +
                        `理由: 危険なBotリストに含まれていたため、自動的にBANしました。`,
                );
            } catch (error) {
                console.error(
                    `危険なBot (${member.user.id}) のBANまたはログ送信中にエラーが発生しました:`,
                    error,
                );
                // BANに失敗した場合、ボットのプライベートメッセージなどで通知することも検討
            }
        }
    } else {
        // 人間のメンバーの場合、レイド検知を実行
        await checkForRaid(member.guild);

        // RaidGuard_AuAuロールが存在する場合、新規参加者に付与
        const raidGuardRole = member.guild.roles.cache.find(
            (role) => role.name === "RaidGuard_AuAu",
        );
        if (raidGuardRole) {
            try {
                await member.roles.add(raidGuardRole);
                console.log(
                    `新規参加者 ${member.user.username} にRaidGuard_AuAuロールを付与しました`,
                );
            } catch (error) {
                console.error(
                    `新規参加者へのRaidGuard_AuAuロール付与に失敗:`,
                    error,
                );
            }
        }
    }
});

// 新しいチャンネルが作成された時のイベント
client.on(Events.ChannelCreate, async (channel) => {
    // テキストチャンネルまたはボイスチャンネルの場合のみ処理
    if (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildVoice
    ) {
        // Muted_AuAuロールが存在するかチェック
        const muteRole = channel.guild.roles.cache.find(
            (role) => role.name === "Muted_AuAu",
        );

        if (muteRole) {
            try {
                // 新しいチャンネルにミュートロールの権限を設定
                await channel.permissionOverwrites.create(muteRole, {
                    SendMessages: false,
                    Speak: false,
                    AddReactions: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false,
                });
                console.log(
                    `新しいチャンネル ${channel.name} にMuted_AuAuロールの権限を設定しました`,
                );
            } catch (error) {
                console.error(
                    `チャンネル ${channel.name} の権限設定に失敗:`,
                    error,
                );
            }
        }

        // RaidGuard_AuAuロールが存在するかチェック
        const raidGuardRole = channel.guild.roles.cache.find(
            (role) => role.name === "RaidGuard_AuAu",
        );

        if (raidGuardRole) {
            try {
                // 新しいチャンネルにレイドガードロールの権限を設定
                await channel.permissionOverwrites.create(raidGuardRole, {
                    SendMessages: false,
                    AddReactions: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false,
                });
                console.log(
                    `新しいチャンネル ${channel.name} にRaidGuard_AuAuロールの権限を設定しました`,
                );
            } catch (error) {
                console.error(
                    `チャンネル ${channel.name} のRaidGuard_AuAu権限設定に失敗:`,
                    error,
                );
            }
        }
    }
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const userId = msg.author.id;
    const now = Date.now();

    // ユーザーの履歴を初期化
    if (!userMessageHistory.has(userId)) {
        userMessageHistory.set(userId, []);
    }

    const history = userMessageHistory.get(userId);

    // 古い履歴を削除（5秒以上前のものを削除）
    const cleanHistory = history.filter(
        (entry) => now - entry.timestamp < SPAM_THRESHOLD_TIME_MS,
    );

    // 現在のメッセージを含めて類似度チェック
    let similarCount = 1; // 現在のメッセージを含む

    for (const entry of cleanHistory) {
        const similarity = stringSimilarity.compareTwoStrings(
            msg.content,
            entry.content,
        );
        console.log(
            `類似度チェック: "${msg.content}" vs "${entry.content}" = ${similarity}`,
        );
        if (similarity >= SIMILARITY_THRESHOLD) {
            similarCount++;
        }
    }

    // 現在のメッセージを履歴に追加
    cleanHistory.push({ content: msg.content, timestamp: now });
    userMessageHistory.set(userId, cleanHistory);

    console.log(
        `ユーザー ${msg.author.username}: 類似メッセージ数 = ${similarCount}`,
    );

    // スパム検知：類似メッセージが閾値以上の場合
    if (similarCount >= SPAM_THRESHOLD_MESSAGES) {
        console.log(
            `スパム検知！ユーザー: ${msg.author.username}, 類似メッセージ数: ${similarCount}`,
        );
        try {
            await msg.delete();

            // Muted_AuAuロールを取得または作成
            let muteRole = msg.guild.roles.cache.find(
                (role) => role.name === "Muted_AuAu",
            );

            if (!muteRole) {
                // ロールが存在しない場合、作成する
                muteRole = await msg.guild.roles.create({
                    name: "Muted_AuAu",
                    color: "#808080", // グレー色
                    reason: "スパム対策用ミュートロール",
                });
                console.log(`Muted_AuAuロールを作成しました`);

                // 全チャンネルに対してミュートロールの権限を設定
                msg.guild.channels.cache.forEach(async (channel) => {
                    if (
                        channel.type === ChannelType.GuildText ||
                        channel.type === ChannelType.GuildVoice
                    ) {
                        try {
                            await channel.permissionOverwrites.create(
                                muteRole,
                                {
                                    SendMessages: false,
                                    Speak: false,
                                    AddReactions: false,
                                    SendMessagesInThreads: false,
                                    CreatePublicThreads: false,
                                    CreatePrivateThreads: false,
                                },
                            );
                        } catch (error) {
                            console.error(
                                `チャンネル ${channel.name} の権限設定に失敗:`,
                                error,
                            );
                        }
                    }
                });
            }

            // ユーザーにミュートロールを付与
            const member = msg.guild.members.cache.get(msg.author.id);
            if (member && !member.roles.cache.has(muteRole.id)) {
                await member.roles.add(muteRole);
                console.log(
                    `${msg.author.username} にMuted_AuAuロールを付与しました`,
                );
            }

            const warn = await msg.channel.send(
                `${msg.author} 類似メッセージの連投を検知しました（${similarCount}件）\n` +
                    `自動的にミュートロールが付与されました。管理者にお問い合わせください。`,
            );
            setTimeout(() => warn.delete().catch(() => {}), 10000); // 10秒後に削除

            // スパム検知後は以降の処理をスキップ
            return;
        } catch (err) {
            console.error("スパム処理失敗:", err);
        }
    }

    // メッセージ内容を小文字に変換して、大文字・小文字を区別しない検索を可能にする
    const messageContentLower = msg.content.toLowerCase();

    // 指定された単語リストのいずれかがメッセージに含まれているかチェックするヘルパー関数
    const containsAnyWord = (wordList) =>
        wordList.some((word) =>
            messageContentLower.includes(word.toLowerCase()),
        );

    if (msg.content === "!ping") {
        msg.reply("Botは応答してるよ!");
    } else if (msg.content.startsWith("!unmute")) {
        // 管理者権限をチェック
        if (!msg.member.permissions.has("MANAGE_ROLES")) {
            msg.reply("このコマンドを使用する権限がありません。");
            return;
        }

        const mentionedUser = msg.mentions.users.first();
        if (!mentionedUser) {
            msg.reply(
                "ミュートを解除するユーザーをメンションしてください。\n使用法: `!unmute @ユーザー名`",
            );
            return;
        }

        const member = msg.guild.members.cache.get(mentionedUser.id);
        const muteRole = msg.guild.roles.cache.find(
            (role) => role.name === "Muted_AuAu",
        );

        if (!member) {
            msg.reply("指定されたユーザーがサーバーに見つかりません。");
            return;
        }

        if (!muteRole) {
            msg.reply("Muted_AuAuロールが見つかりません。");
            return;
        }

        if (!member.roles.cache.has(muteRole.id)) {
            msg.reply("指定されたユーザーはミュートされていません。");
            return;
        }

        try {
            await member.roles.remove(muteRole);
            msg.reply(`${mentionedUser.username} のミュートを解除しました。`);
            console.log(
                `${msg.author.username} が ${mentionedUser.username} のミュートを解除しました`,
            );
        } catch (error) {
            console.error("ミュート解除失敗:", error);
            msg.reply("ミュートの解除に失敗しました。");
        }
    } else if (containsAnyWord(homo_words)) {
        // homo_words が含まれていてもメッセージは削除せず、返信のみを行う
        msg.reply(":warning: 淫夢発言を検知しました！！ :warning:");
    } else if (containsAnyWord(soudayo)) {
        msg.reply("そうだよ(便乗)");
    } else if (containsAnyWord(abunai_words)) {
        try {
            // ユーザーのメッセージを削除する前に警告メッセージを送信
            // warningMessage変数にボットが送ったメッセージが格納される
            const warningMessage = await msg.reply(
                `:warning: 危険発言を検知しました！！:warning:\nhttps://i.imgur.com/IEq6RPc.jpeg`,
            );
            // 3秒後にユーザーの元のメッセージを削除
            setTimeout(() => {
                msg.delete().catch((err) =>
                    console.error("元のメッセージの削除に失敗しました:", err),
                );
            }, 100);
            // 以前あった warningMessage.delete() の行を削除しました。
            // これでボットの警告メッセージは残ります。
        } catch (error) {
            console.error(
                "危険発言を含むメッセージの処理中にエラーが発生しました:",
                error,
            );
        }
    }
});

client.login(token);

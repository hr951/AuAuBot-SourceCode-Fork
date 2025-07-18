const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// データファイルのパス
const AUTH_CONFIG_FILE = path.join(__dirname, "auth_configs.json");
const AUTH_SESSIONS_FILE = path.join(__dirname, "auth_sessions.json");

// 認証問題データ（画像と選択肢）
const authQuestions = [
  {
    image: "https://i.imgur.com/6xfvToX.png",
    question: "この画像に表示されている文字を選んでください",
    options: [
      { label: "FJ1CSJI", value: "fj1csji", correct: true },
      { label: "FIIDZII", value: "fiidzii", correct: false },
      { label: "ELLCSJI", value: "ellcsji", correct: false },
      { label: "EKEKEKE", value: "ekekeke", correct: false },
    ],
  },
  {
    image: "https://i.imgur.com/dFEk4DM.png",
    question: "この画像に表示されている文字を選んでください",
    options: [
      { label: "Ml13291", value: "ml13291", correct: false },
      { label: "WWWWWWW", value: "wwwwwww", correct: false },
      { label: "Wji3Z91", value: "wji3z91", correct: true },
      { label: "M113Z91", value: "m113z91", correct: false },
    ],
  },
];

// 設定とセッションを管理するクラス
class AuthManager {
  constructor() {
    this.configs = new Map();
    this.sessions = new Map();
    this.loadConfigs();
    this.loadSessions();
  }

  // 設定をファイルから読み込み
  loadConfigs() {
    try {
      if (fs.existsSync(AUTH_CONFIG_FILE)) {
        const data = fs.readFileSync(AUTH_CONFIG_FILE, "utf8");
        const configs = JSON.parse(data);
        this.configs = new Map(Object.entries(configs));
      }
    } catch (error) {
      console.error("設定ファイルの読み込みエラー:", error);
    }
  }

  // 設定をファイルに保存
  saveConfigs() {
    try {
      const data = Object.fromEntries(this.configs);
      fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("設定ファイルの保存エラー:", error);
    }
  }

  // セッションをファイルから読み込み
  loadSessions() {
    try {
      if (fs.existsSync(AUTH_SESSIONS_FILE)) {
        const data = fs.readFileSync(AUTH_SESSIONS_FILE, "utf8");
        const sessions = JSON.parse(data);
        this.sessions = new Map(Object.entries(sessions));
      }
    } catch (error) {
      console.error("セッションファイルの読み込みエラー:", error);
    }
  }

  // セッションをファイルに保存
  saveSessions() {
    try {
      const data = Object.fromEntries(this.sessions);
      fs.writeFileSync(AUTH_SESSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("セッションファイルの保存エラー:", error);
    }
  }

  // 設定を保存
  setConfig(messageId, config) {
    this.configs.set(messageId, config);
    this.saveConfigs();
  }

  // 設定を取得
  getConfig(messageId) {
    return this.configs.get(messageId);
  }

  // セッションを保存
  setSession(userId, session) {
    this.sessions.set(userId, session);
    this.saveSessions();
  }

  // セッションを取得
  getSession(userId) {
    return this.sessions.get(userId);
  }

  // セッションを削除
  deleteSession(userId) {
    this.sessions.delete(userId);
    this.saveSessions();
  }
}

// グローバルインスタンス
const authManager = new AuthManager();

// VPNチェック関数
async function checkVPN(ip) {
  try {
    // 例：無料のVPN検出API（実際の実装では適切なAPIキーを使用）
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    const data = response.data;

    // VPNやプロキシを検出（実際のAPIに応じて条件を調整）
    if (
      data.org &&
      (data.org.toLowerCase().includes("vpn") ||
        data.org.toLowerCase().includes("proxy") ||
        data.org.toLowerCase().includes("hosting"))
    ) {
      return true;
    }
    return false;
  } catch (error) {
    console.error("VPN検出エラー:", error);
    return false; // エラーの場合は通す
  }
}

// サブ垢検出関数（簡易版）
async function checkSubAccount(userId, guildId, client) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);

    // アカウント作成から7日以内を疑わしいとする例
    const accountAge = Date.now() - member.user.createdTimestamp;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (accountAge < sevenDays) {
      return true;
    }

    return false;
  } catch (error) {
    console.error("サブ垢検出エラー:", error);
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("auth-panel")
    .setDescription("認証パネルを設置します")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("パネルのタイトル")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("パネルの説明")
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("認証後に付与する役職")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("パネルの色（HEX形式: #FF0000）")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("button-color")
        .setDescription("ボタンの色")
        .setRequired(false)
        .addChoices(
          { name: "青", value: "Primary" },
          { name: "緑", value: "Success" },
          { name: "赤", value: "Danger" },
          { name: "グレー", value: "Secondary" },
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName("vpn-block")
        .setDescription("VPNを拒否するか")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("sub-account-block")
        .setDescription("サブ垢を拒否するか")
        .setRequired(false),
    ),

  async execute(interaction) {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const color = interaction.options.getString("color") || "#0099FF";
    const buttonColor =
      interaction.options.getString("button-color") || "Primary";
    const vpnBlock = interaction.options.getBoolean("vpn-block") || false;
    const subAccountBlock =
      interaction.options.getBoolean("sub-account-block") || false;
    const role = interaction.options.getRole("role");

    // 埋め込みを作成
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp()
      .setFooter({ text: "認証システム" });

    // ボタンを作成
    const button = new ButtonBuilder()
      .setCustomId("start_auth")
      .setLabel("認証を開始")
      .setStyle(ButtonStyle[buttonColor])
      .setEmoji("🔐");

    const row = new ActionRowBuilder().addComponents(button);

    // パネルを送信
    const message = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    // 認証設定を保存（メッセージIDをキーとして使用）
    const authConfig = {
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      roleId: role.id,
      vpnBlock,
      subAccountBlock,
      messageId: message.id,
    };

    authManager.setConfig(message.id, authConfig);
  },
};

// グローバルな認証ハンドラー関数（main.jsから呼び出し）
async function handleAuthInteraction(interaction) {
  if (interaction.customId === "start_auth") {
    await handleAuthStart(interaction);
  } else if (interaction.customId === "auth_answer") {
    await handleAuthAnswer(interaction);
  }
}

async function handleAuthStart(interaction) {
  const messageId = interaction.message.id;
  const config = authManager.getConfig(messageId);

  if (!config) {
    return await interaction.reply({
      content: "❌ 認証設定が見つかりません。管理者にお問い合わせください。",
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const userIp = "127.0.0.1"; // 実際のIPを取得する方法は制限されている

  try {
    // VPNチェック
    if (config.vpnBlock) {
      const isVPN = await checkVPN(userIp);
      if (isVPN) {
        return await interaction.reply({
          content:
            "❌ VPNまたはプロキシが検出されました。VPNを無効にしてから再度お試しください。",
          ephemeral: true,
        });
      }
    }

    // サブ垢チェック
    if (config.subAccountBlock) {
      const isSubAccount = await checkSubAccount(
        userId,
        config.guildId,
        interaction.client,
      );
      if (isSubAccount) {
        return await interaction.reply({
          content:
            "❌ 新しいアカウントまたはサブアカウントの可能性があります。しばらくしてから再度お試しください。",
          ephemeral: true,
        });
      }
    }

    // 認証問題を選択
    const question =
      authQuestions[Math.floor(Math.random() * authQuestions.length)];

    // セッションを保存
    authManager.setSession(userId, {
      questionIndex: authQuestions.indexOf(question),
      attempts: 0,
      config: config,
      timestamp: Date.now(),
    });

    // 認証問題の埋め込みを作成
    const authEmbed = new EmbedBuilder()
      .setTitle("🔐 認証問題")
      .setDescription(question.question)
      .setImage(question.image)
      .setColor("#FFA500")
      .setFooter({ text: "正しい選択肢を選んでください" });

    // 選択肢メニューを作成
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("auth_answer")
      .setPlaceholder("正しい答えを選択してください")
      .addOptions(
        question.options.map((option) => ({
          label: option.label,
          value: option.value,
          description: "この選択肢を選ぶ",
        })),
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      embeds: [authEmbed],
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    console.error("認証開始エラー:", error);
    await interaction.reply({
      content:
        "❌ 認証処理中にエラーが発生しました。しばらくしてから再度お試しください。",
      ephemeral: true,
    });
  }
}

async function handleAuthAnswer(interaction) {
  const userId = interaction.user.id;
  const session = authManager.getSession(userId);

  if (!session) {
    return await interaction.reply({
      content:
        "❌ 認証セッションが見つかりません。再度認証を開始してください。",
      ephemeral: true,
    });
  }

  const question = authQuestions[session.questionIndex];
  const selectedValue = interaction.values[0];
  const correctAnswer = question.options.find((option) => option.correct);

  if (selectedValue === correctAnswer.value) {
    // 正解の場合
    try {
      const guild = interaction.guild;
      const member = await guild.members.fetch(userId);
      const role = await guild.roles.fetch(session.config.roleId);

      await member.roles.add(role);

      // セッションを削除
      authManager.deleteSession(userId);

      await interaction.reply({
        content: "✅ 認証が完了しました！役職が付与されました。",
        ephemeral: true,
      });
    } catch (error) {
      console.error("役職付与エラー:", error);
      await interaction.reply({
        content:
          "❌ 役職の付与中にエラーが発生しました。管理者にお問い合わせください。",
        ephemeral: true,
      });
    }
  } else {
    // 不正解の場合
    session.attempts++;

    if (session.attempts >= 3) {
      // 最大試行回数に達した場合
      authManager.deleteSession(userId);
      await interaction.reply({
        content:
          "❌ 認証に失敗しました。最大試行回数に達しました。しばらくしてから再度お試しください。",
        ephemeral: true,
      });
    } else {
      // 再試行（セッションを更新）
      authManager.setSession(userId, session);
      const remainingAttempts = 3 - session.attempts;
      await interaction.reply({
        content: `❌ 不正解です。残り ${remainingAttempts} 回試行できます。`,
        ephemeral: true,
      });
    }
  }
}

// エクスポート用の関数
module.exports.handleAuthInteraction = handleAuthInteraction;

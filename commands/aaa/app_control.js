
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('app_control')
        .setDescription('外部アプリケーションの使用制限を管理します')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('実行するアクション')
                .setRequired(true)
                .addChoices(
                    { name: '制限を有効にする', value: 'enable' },
                    { name: '制限を無効にする', value: 'disable' },
                    { name: '現在の状態を確認', value: 'status' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    async execute(interaction) {
        const action = interaction.options.getString('action');
        const guild = interaction.guild;
        
        try {
            switch (action) {
                case 'enable':
                    global.appRestrictionEnabled = true;
                    
                    // AppRestrict_AuAuロールを取得または作成
                    let restrictRole = guild.roles.cache.find(role => role.name === 'AppRestrict_AuAu');
                    if (!restrictRole) {
                        restrictRole = await guild.roles.create({
                            name: 'AppRestrict_AuAu',
                            color: '#FFA500',
                            reason: 'アプリケーション使用制限ロール',
                        });
                        console.log('AppRestrict_AuAuロールを作成しました');
                    }
                    
                    // 全チャンネルでAppRestrict_AuAuロールのアプリケーション使用を制限
                    const channels = guild.channels.cache.filter(channel => 
                        channel.type === ChannelType.GuildText || 
                        channel.type === ChannelType.GuildVoice
                    );
                    
                    let successCount = 0;
                    let errorCount = 0;
                    
                    for (const [, channel] of channels) {
                        try {
                            await channel.permissionOverwrites.create(restrictRole, {
                                UseApplicationCommands: false,
                            });
                            successCount++;
                        } catch (error) {
                            console.error(`チャンネル ${channel.name} のアプリケーション制限権限設定に失敗:`, error);
                            errorCount++;
                        }
                    }
                    
                    await interaction.reply({
                        content: `✅ **外部アプリケーションの使用制限を有効にしました**\n` +
                                `📊 チャンネル権限設定: ${successCount}個成功, ${errorCount}個失敗\n` +
                                `⚠️ 今後、外部アプリケーションを使用したユーザーには自動的に制限ロールが付与されます。`,
                        ephemeral: true
                    });
                    
                    // ログチャンネルに通知
                    let logChannel = guild.channels.cache.find(channel => 
                        channel.name === 'auau-log' && channel.type === ChannelType.GuildText
                    );
                    
                    if (logChannel) {
                        await logChannel.send(
                            `🚨 **外部アプリケーション使用制限が有効になりました**\n` +
                            `実行者: ${interaction.user.username} (${interaction.user.id})\n` +
                            `今後、外部アプリケーションを使用したユーザーには自動的にAppRestrict_AuAuロールが付与されます。`
                        );
                    }
                    break;
                    
                case 'disable':
                    global.appRestrictionEnabled = false;
                    
                    await interaction.reply({
                        content: `✅ **外部アプリケーションの使用制限を無効にしました**\n` +
                                `📝 既存のAppRestrict_AuAuロールは残りますが、新規の自動付与は停止されます。`,
                        ephemeral: true
                    });
                    
                    // ログチャンネルに通知
                    let logChannel2 = guild.channels.cache.find(channel => 
                        channel.name === 'auau-log' && channel.type === ChannelType.GuildText
                    );
                    
                    if (logChannel2) {
                        await logChannel2.send(
                            `✅ **外部アプリケーション使用制限が無効になりました**\n` +
                            `実行者: ${interaction.user.username} (${interaction.user.id})\n` +
                            `外部アプリケーションの自動制限が停止されました。`
                        );
                    }
                    break;
                    
                case 'status':
                    const restrictRole2 = guild.roles.cache.find(role => role.name === 'AppRestrict_AuAu');
                    const membersWithRole = restrictRole2 ? guild.members.cache.filter(member => 
                        member.roles.cache.has(restrictRole2.id)
                    ).size : 0;
                    
                    await interaction.reply({
                        content: `📊 **外部アプリケーション使用制限の状態**\n` +
                                `制限機能: ${global.appRestrictionEnabled ? '🔴 有効' : '🟢 無効'}\n` +
                                `制限ロール保持者: ${membersWithRole}人\n` +
                                `AppRestrict_AuAuロール: ${restrictRole2 ? '存在' : '未作成'}`,
                        ephemeral: true
                    });
                    break;
            }
        } catch (error) {
            console.error('app_controlコマンドでエラーが発生しました:', error);
            await interaction.reply({
                content: 'コマンドの実行中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
};

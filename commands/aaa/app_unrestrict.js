
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('app_unrestrict')
        .setDescription('ユーザーのアプリケーション使用制限を解除します')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('制限を解除するユーザー')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const guild = interaction.guild;
        const member = guild.members.cache.get(targetUser.id);
        
        if (!member) {
            await interaction.reply({
                content: '指定されたユーザーがサーバーに見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        const restrictRole = guild.roles.cache.find(role => role.name === 'AppRestrict_AuAu');
        
        if (!restrictRole) {
            await interaction.reply({
                content: 'AppRestrict_AuAuロールが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        if (!member.roles.cache.has(restrictRole.id)) {
            await interaction.reply({
                content: '指定されたユーザーはアプリケーション使用制限を受けていません。',
                ephemeral: true
            });
            return;
        }
        
        try {
            await member.roles.remove(restrictRole);
            
            await interaction.reply({
                content: `${targetUser.username} のアプリケーション使用制限を解除しました。`
            });
            
            console.log(`${interaction.user.username} が ${targetUser.username} のAppRestrict_AuAuロールを解除しました`);
            
            // ログチャンネルに通知
            let logChannel = guild.channels.cache.find(channel => 
                channel.name === 'auau-log' && channel.type === ChannelType.GuildText
            );
            
            if (logChannel) {
                await logChannel.send(
                    `🔓 **アプリケーション使用制限解除**\n` +
                    `対象ユーザー: ${targetUser.username} (${targetUser.id})\n` +
                    `実行者: ${interaction.user.username} (${interaction.user.id})\n` +
                    `AppRestrict_AuAuロールを解除しました。`
                );
            }
            
        } catch (error) {
            console.error('アプリケーション制限解除に失敗:', error);
            await interaction.reply({
                content: 'アプリケーション制限の解除に失敗しました。',
                ephemeral: true
            });
        }
    },
};

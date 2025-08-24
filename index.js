const { 
  Client, GatewayIntentBits, Partials, PermissionsBitField, 
  EmbedBuilder, AuditLogEvent, ActionRowBuilder, ButtonBuilder, ButtonStyle 
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const prefix = '&';
const invites = new Map();
const invitesMap = new Map();
const userMessages = new Map();
const actionTracker = new Map();
const MAX_ACTIONS = 3;

const logChannels = {
  banLogChannelId: '1196375859104317461',
  unbanLogChannelId: '1196376525461786734',
  memberRemoveLogChannelId: '1196376358348140544',
  messageDeleteLogChannelId: '1196376149702475818',
  messageUpdateLogChannelId: '1196376203460870195',
  channelDeleteLogChannelId: '1196376095969255455',
  channelCreateLogChannelId: '1196376023693013172',
  channelUpdateLogChannelId: '1196376605208096818',
  roleDeleteLogChannelId: '1196376183575674880',
  roleCreateLogChannelId: '1196376068882448444',
  roleUpdateLogChannelId: '1196376630411673650',
  nicknameUpdateLogChannelId: '1196376380351451208',
  voiceLogChannelId: '1196376765401153586',
  timeoutLogChannelId: '1196375994232225802',
  kickLogChannelId: '1196376279646228511',
  protectionLogChannelId: '1196376675055845426',
  inviteLogChannelId: '1196376497338986517',
  guildUpdateLogChannelId: '1209859968560537620'
};

const roleIds = {
  SERVEROWNER: '1319779381471608932',
  𝐅𝐨𝐮𝐧𝐝𝐞𝐫: '1350649812642435112',
  𝐌𝐨𝐝𝐞𝐫𝐚𝐭𝐨𝐫: '1399059261857992806',
  𝐀𝐃𝐌𝐈𝐍: '1376825337056333884',
  fullAccess: '1209871038284832908',
  mediumAccess: '1195472593541673031',
  𝐒𝐭𝐨𝐫𝐞𝐒𝐮𝐩𝐩𝐨𝐫𝐭: '1404397747343327334',
};
const badWords = [
  'كلب','قحبة','خنيث','حقير','زق','يلعن','عاهرة','نجس','متناك','تف عليك','كس امك',
  'fuck','bitch','slut','dick','pussy','rape','porn','sex','nigga','cum'
];

// ================== Full Protection System ==================

const OWNER_ID = '1114668397725220954';
const LOG_CHANNEL_ID = '1196376675055845426'; // Replace with your log channel ID

const EMOJI_SPAM_LIMIT = 10;
const CAPS_PERCENTAGE_LIMIT = 70;
const SPAM_LIMIT = 10;
const TIME_WINDOW = 10000;


// Delete all user messages in a channel (up to 100 messages)
async function deleteUserMessages(channel, userId) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const userMessages = messages.filter(m => m.author.id === userId);
  if (userMessages.size > 0) {
    await channel.bulkDelete(userMessages, true).catch(() => {});
  }
}

// Timeout punishment
async function timeoutMember(guild, userId, duration, reason) {
  try {
    const member = await guild.members.fetch(userId);
    if (member && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await member.timeout(duration, reason);

      // Send log to log channel
      const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 User Timed Out')
          .setDescription(`User: <@${userId}> has been timed out for **${reason}**.`)
          .setColor('Orange')
          .setTimestamp();
        logChannel.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    console.error('Timeout failed:', err);
  }
}

// ================== Anti-Spam & Anti-Link & Anti-Caps ==================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const content = message.content;

  // 1️⃣ Prevent @everyone & @here
  if (message.mentions.everyone) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'Mentioning @everyone');
    return;
  }

  // 2️⃣ Links
  if (/https?:\/\/|discord\.gg/i.test(content)) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'Posting links');
    return;
  }

  // 4️⃣ Emoji Spam
  const emojiCount = (content.match(/<a?:.+?:\d+>|[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;
  if (emojiCount >= EMOJI_SPAM_LIMIT) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'Emoji spam');
    return;
  }

  // 5️⃣ Message Spam
  const now = Date.now();
  const timestamps = userMessages.get(message.author.id) || [];
  const updated = timestamps.filter(t => now - t < TIME_WINDOW);
  updated.push(now);
  userMessages.set(message.author.id, updated);

  if (updated.length >= SPAM_LIMIT) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'Message spam');
    return;
  }
});

// ================== Anti-Nuke Protection ==================
client.on('guildAuditLogEntryCreate', async (entry) => {
  const actionType = entry.action;
  const executor = entry.executor;

  if (!executor || executor.bot || executor.id === OWNER_ID) return;

  const guild = entry.target.guild || entry.guild;
  const member = await guild.members.fetch(executor.id).catch(() => null);

  if (!member) return;

  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const destructiveActions = [
    AuditLogEvent.RoleDelete,
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.MemberBanAdd,
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.BotAdd,
    AuditLogEvent.EmojiDelete
  ];

  if (destructiveActions.includes(actionType)) {
    await member.roles.set([]).catch(() => {});
    await guild.members.ban(member.id, { reason: 'Nuke Protection Triggered' }).catch(() => {});

    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Nuke Attempt Detected')
        .setDescription(`User: **${executor.tag}** attempted a destructive action and was banned.`)
        .setColor('Red')
        .setTimestamp();
      logChannel.send({ embeds: [embed] });
    }
  }
});

const getInviteCounts = async (guild) => {
    return new Map(guild.invites.cache.map(invite => [invite.code, invite.uses]));
};

client.once('ready', async () => {
    console.log('Bot is online!');
	console.log('Code by bandar.dev!');
	console.log('https://discord.gg/Y7ysBGFtQs');

    // Load all server invites
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const currentInvites = await guild.invites.fetch();
            invites[guildId] = new Map(currentInvites.map(invite => [invite.code, invite.uses]));
            console.log(`Loaded ${currentInvites.size} invites for guild: ${guild.name}`);
        } catch (err) {
            console.log(`Failed to load invites for guild: ${guild.name}`);
            console.error(err);
        }
    }
});

client.on('inviteCreate', async invite => {
    const guildInvites = invites[invite.guild.id];
    guildInvites.set(invite.code, invite.uses);
});

client.on('inviteDelete', async invite => {
    const guildInvites = invites[invite.guild.id];
    guildInvites.delete(invite.code);
});

client.on('guildMemberAdd', async member => {
    const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
    const role = member.guild.roles.cache.get(config.autoRoleId);

    
    if (role) {
        member.roles.add(role).catch(console.error);
    } else {
        console.log('Role not found');
    }

    const newInvites = await member.guild.invites.fetch();
    const usedInvite = newInvites.find(inv => {
        const prevUses = (invites[member.guild.id].get(inv.code) || 0);
        return inv.uses > prevUses;
    });

    let inviterMention = 'Unknown';
    if (usedInvite && usedInvite.inviter) {
        inviterMention = `<@${usedInvite.inviter.id}>`;
        console.log(`Member joined with invite code ${usedInvite.code}, invited by ${inviterMention}`);
    } else {
        console.log(`Member joined, but no matching invite was found.`);
    }

    
    const fullUser = await client.users.fetch(member.user.id, { force: true });

    const welcomeEmbed = new Discord.MessageEmbed()
        .setColor('#05131f')
        .setTitle('Welcome to the Server!')
        .setDescription(`Hello ${member}, welcome to **${member.guild.name}**! enjoy your stay.`)
        .addFields(
            { name: 'Username', value: member.user.tag, inline: true },
            { name: 'Invited By', value: inviterMention, inline: true },
            { name: 'Invite Used', value: usedInvite ? `||${usedInvite.code}||` : 'Direct Join', inline: true },
            { name: 'You\'re Member', value: `${member.guild.memberCount}`, inline: true },
            { name: 'Server Rules', value: '<#1164662648080707604>.', inline: true },
            { name: 'Support Channel', value: '<#1166772582951964702>.', inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
    const bannerUrl = fullUser.bannerURL({ dynamic: true, format: 'png', size: 1024 });
    if (bannerUrl) {
        welcomeEmbed.setImage(bannerUrl);
    }

    // buttons
    const row = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setStyle('LINK')
                .setURL('https://www.youtube.com/@wick_studio')       // link to button 1
                .setLabel('YouTube')                                 // name of button 1
                .setEmoji('<:Youtubee:1158819353953828984>'),       // emoji of button 1
            new MessageButton()
                .setStyle('LINK')
                .setURL('https://github.com/wickstudio')           // link to button 2
                .setLabel('GitHub')                               // name of button 2
                .setEmoji('<:Github:1132413518348566589>'),      // emoji of button 2
            new MessageButton()
                .setStyle('LINK')
                .setURL('https://wickdev.xyz/')                // link to button 3
                .setLabel('Website')                          // name of button 3
                .setEmoji('<:web:1129345172333932595>')      // emoji of button 3
        );

    welcomeChannel.send({ embeds: [welcomeEmbed], components: [row] });

    invites[member.guild.id] = new Map(newInvites.map(invite => [invite.code, invite.uses]));
});

function sendBoth(arabic, english) {
  return message.reply({ content: `${arabic}\n${english}` });
}

function hasPermission(member, command) {
  const hasFull = member.roles.cache.has(roleIds.fullAccess);
  const hasMedium = member.roles.cache.has(roleIds.mediumAccess);
  const forbiddenForFull = ['باند', 'كيك', 'مانج-السيرفر'];
  const forbiddenForMedium = ['باند', 'كيك', 'امسح', 'تايم-اوت', 'مانج-السيرفر'];

  if (hasFull && !forbiddenForFull.includes(command)) return true;
  if (hasMedium && !forbiddenForMedium.includes(command)) return true;
  return false;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  if (!hasPermission(message.member, command)) return message.reply('❌ ما عندك صلاحية استخدام هذا الأمر.');

  if (command === 'ping') return sendBoth('🏓 البوت شغال تمام!', '🏓 Bot is up and running!');

  if (command === 'lock') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return sendBoth('🔒 تم قفل القناة.', '🔒 Channel locked.');
  }

  if (command === 'unlock') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
    return sendBoth('🔓 تم فتح القناة.', '🔓 Channel unlocked.');
  }

  if (command === 'مسح') {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return sendBoth('❌ رقم بين 1-100', '❌ Number between 1-100.');
    await message.channel.bulkDelete(amount, true);
    return sendBoth(`✅ تم حذف ${amount} رسالة.`, `✅ Deleted ${amount} messages.`);
  }

  if (command === 'kick') {
    const member = message.mentions.members.first();
    if (!member || !member.kickable) return sendBoth('❌ لا يمكن طرده.', '❌ Cannot kick this user.');
    await member.kick();
    return sendBoth(`✅ تم طرد ${member.user.tag}.`, `✅ Kicked ${member.user.tag}.`);
  }

  if (command === 'ban') {
    const member = message.mentions.members.first();
    if (!member || !member.bannable) return sendBoth('❌ لا يمكن حظره.', '❌ Cannot ban this user.');
    await member.ban();
    return sendBoth(`✅ تم حظر ${member.user.tag}.`, `✅ Banned ${member.user.tag}.`);
  }

  if (command === 'unban') {
    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId) return sendBoth('❌ اكتب ID العضو.', '❌ Provide user ID.');
    try {
      await message.guild.bans.remove(userId);
      return sendBoth(`✅ تم فك الحظر عن ${userId}.`, `✅ Unbanned ${userId}.`);
    } catch {
      return sendBoth('❌ فشل في فك الحظر.', '❌ Failed to unban.');
    }
  }

  if (command === 'timeout') {
    const member = message.mentions.members.first();
    const time = parseInt(args[1]);
    if (!member || isNaN(time)) return sendBoth('❌ منشن العضو والمدة.', '❌ Mention user and duration.');
    await member.timeout(time, `Timeout by ${message.author.tag}`);
    return sendBoth(`✅ تم إعطاء ${member.user.tag} تايم أوت.`, `✅ Timeout given to ${member.user.tag}.`);
  }

if (command === 'نشر') {
  const content = args.join(' ');
  if (!content) return message.reply('❌ اكتب القوانين بعد الأمر.');

  await message.delete().catch(() => {});

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() || null })
    .setDescription(content)
    .setColor('#2F3136')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_rules')
      .setLabel('✅ أوافق على القوانين')
      .setStyle(ButtonStyle.Success)
  );

  message.channel.send({ embeds: [embed], components: [row] });

} else if (command === 'send') {
  const content = args.join(' ');
  if (!content) return message.reply('❌ اكتب الرسالة بعد الأمر.');

  await message.delete().catch(() => {});

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() || null })
    .setDescription(content)
    .setColor('#2F3136')
    .setTimestamp();

  message.channel.send({ embeds: [embed] });

  }

  if (command === 'help' || command === 'مساعدة') {
    await message.delete().catch(() => {});
    return message.channel.send(`
🔧 **Available Commands | الأوامر المتاحة:**

\`&ping\`
\`&اقفل / &افتح\`
\`&امسح 10\`
\`&نشر @message\`
\`&send @message\`
\`&كيك @user\`
\`&باند @user\`
\`&فك-باند @user\`
\`&تايم-اوت @user 60000\`
    `);
  }
});
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'accept_rules') {
    await interaction.reply({ content: '✅ لقد وافقت على القوانين بنجاح.', ephemeral: true });

    // تقدر تضيف له رتبة تلقائيًا هنا:
   await interaction.member.roles.add('1405417400614260756');
  }
});
function createLogEmbed(title, description, color = 'Grey') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

// باند
client.on('guildBanAdd', async (ban) => {
  const channel = client.channels.cache.get(logChannels.banLogChannelId);
  if (!channel) return;
  const fetchedLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const banLog = fetchedLogs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = banLog?.executor;
  const reason = banLog?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('🚫 تم حظر عضو', `تم حظر **${ban.user.tag}** بواسطة ${executor?.tag || 'مجهول'}\n**السبب:** ${reason}`, 'Red');
  channel.send({ embeds: [embed] });
});

// فك باند
client.on('guildBanRemove', async (ban) => {
  const channel = client.channels.cache.get(logChannels.unbanLogChannelId);
  if (!channel) return;
  const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
  const entry = logs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = entry?.executor;
  const reason = entry?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('✅ تم رفع الحظر', `تم فك الحظر عن **${ban.user.tag}** بواسطة ${executor?.tag || 'مجهول'}\n**السبب:** ${reason}`, 'Green');
  channel.send({ embeds: [embed] });
});

// خروج أو طرد عضو
client.on('guildMemberRemove', async member => {
  const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const kickLog = logs.entries.find(entry => entry.target.id === member.id);
  const executor = kickLog?.executor;
  const reason = kickLog?.reason || 'لم يتم تحديد السبب';
  const channel = client.channels.cache.get(logChannels.memberRemoveLogChannelId);
  if (!channel) return;

  const embed = createLogEmbed(
    kickLog ? '👢 طرد عضو' : '👋 خروج عضو',
    kickLog 
      ? `تم طرد **${member.user.tag}** بواسطة ${executor?.tag || 'مجهول'}\n**السبب:** ${reason}`
      : `**${member.user.tag}** خرج من السيرفر.`,
    kickLog ? 'Orange' : 'Grey'
  );
  channel.send({ embeds: [embed] });
});

// حذف/إنشاء/تعديل رومات
client.on('channelDelete', async channelDeleted => {
  const logs = await channelDeleted.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const executor = logs.entries.first()?.executor;
  const reason = logs.entries.first()?.reason || 'لم يتم تحديد السبب';
  const logChannel = client.channels.cache.get(logChannels.channelDeleteLogChannelId);
  if (logChannel) {
    const embed = createLogEmbed('❌ حذف روم', `**${channelDeleted.name}** تم حذفه بواسطة ${executor?.tag || 'مجهول'}\n**السبب:** ${reason}`, 'DarkRed');
    logChannel.send({ embeds: [embed] });
  }

  // حماية ضد حذف روم
  if (executor && !executor.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    const member = await channelDeleted.guild.members.fetch(executor.id);
    if (member) {
      member.roles.set([]).catch(() => {});
      const protection = channelDeleted.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protection?.send(`🚨 تم سحب صلاحيات **${executor.tag}** بسبب حذف روم بدون إذن.`);
    }
  }
});

client.on('channelCreate', async channel => {
  const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const executor = logs.entries.first()?.executor;
  const embed = createLogEmbed('✅ إنشاء روم', `**${channel.name}** تم إنشاؤه بواسطة ${executor?.tag || 'مجهول'}`, 'Green');
  const logChannel = client.channels.cache.get(logChannels.channelCreateLogChannelId);
  logChannel?.send({ embeds: [embed] });
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  const logs = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 });
  const executor = logs.entries.first()?.executor;
  const embed = createLogEmbed('✏️ تعديل روم', `**${oldChannel.name}** تم تعديله بواسطة ${executor?.tag || 'مجهول'}`, 'Yellow');
  const logChannel = client.channels.cache.get(logChannels.channelUpdateLogChannelId);
  logChannel?.send({ embeds: [embed] });
});

// حذف/إنشاء/تعديل رتب
client.on('roleDelete', async role => {
  const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const executor = logs.entries.first()?.executor;
  const embed = createLogEmbed('⚠️ حذف رتبة', `تم حذف رتبة **${role.name}** بواسطة ${executor?.tag || 'مجهول'}`, 'Red');
  const logChannel = client.channels.cache.get(logChannels.roleDeleteLogChannelId);
  logChannel?.send({ embeds: [embed] });

  if (executor && !executor.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    const member = await role.guild.members.fetch(executor.id);
    member?.roles.set([]).catch(() => {});
    const protection = role.guild.channels.cache.get(logChannels.protectionLogChannelId);
    protection?.send(`🚨 تم سحب صلاحيات **${executor.tag}** بسبب حذف رتبة بدون إذن.`);
  }
});

client.on('roleCreate', async role => {
  const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const executor = logs.entries.first()?.executor;
  const embed = createLogEmbed('✅ إنشاء رتبة', `تم إنشاء رتبة **${role.name}** بواسطة ${executor?.tag || 'مجهول'}`, 'Green');
  const logChannel = client.channels.cache.get(logChannels.roleCreateLogChannelId);
  logChannel?.send({ embeds: [embed] });
});

client.on('roleUpdate', async (oldRole, newRole) => {
  const logs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
  const executor = logs.entries.first()?.executor;
  const embed = createLogEmbed('✏️ تعديل رتبة', `تم تعديل رتبة **${oldRole.name}** بواسطة ${executor?.tag || 'مجهول'}`, 'Yellow');
  const logChannel = client.channels.cache.get(logChannels.roleUpdateLogChannelId);
  logChannel?.send({ embeds: [embed] });
});

// تعديل نك نيم
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    const logs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
    const executor = logs.entries.first()?.executor;
    const embed = createLogEmbed(
      '📝 تغيير نك نيم',
      `**${newMember.user.tag}** تغير نكه بواسطة ${executor?.tag || 'مجهول'}\n**من:** ${oldMember.nickname || 'لا يوجد'} → **إلى:** ${newMember.nickname || 'لا يوجد'}`,
      'Orange'
    );
    const logChannel = client.channels.cache.get(logChannels.nicknameUpdateLogChannelId);
    logChannel?.send({ embeds: [embed] });
  }

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;
  if (oldTimeout !== newTimeout) {
    const channel = client.channels.cache.get(logChannels.timeoutLogChannelId);
    if (!channel) return;
    if (newTimeout && newTimeout > Date.now()) {
      const until = new Date(newTimeout).toLocaleString();
      const embed = createLogEmbed('⏳ تايم آوت مفعّل', `**${newMember.user.tag}** حصل على تايم آوت حتى ${until}`, 'Orange');
      channel.send({ embeds: [embed] });
    } else {
      const embed = createLogEmbed('✅ تايم آوت مرفوع', `تم رفع التايم آوت عن **${newMember.user.tag}**`, 'Green');
      channel.send({ embeds: [embed] });
    }
  }
});

// لوق الرسائل
client.on('messageDelete', async message => {
  if (!message.guild) return;
  const channel = client.channels.cache.get(logChannels.messageDeleteLogChannelId);
  if (channel) {
    const embed = createLogEmbed('🗑️ حذف رسالة', `تم حذف رسالة من **${message.author?.tag || 'مجهول'}** في **${message.channel.name}**`, 'Grey');
    channel.send({ embeds: [embed] });
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || oldMessage.content === newMessage.content) return;
  const channel = client.channels.cache.get(logChannels.messageUpdateLogChannelId);
  if (channel) {
    const embed = createLogEmbed('✏️ تعديل رسالة', `**${newMessage.author?.tag}** عدّل رسالته:\n**قبل:** ${oldMessage.content || '...'}\n**بعد:** ${newMessage.content || '...'}`, 'Yellow');
    channel.send({ embeds: [embed] });
  }
});
const sqlite3 = require('sqlite3');
const { open } = require('sqlite'); // ← هذا مهم

let db;

(async () => {
    try {
        db = await open({
            filename: './leveling.db',
            driver: sqlite3.Database
        });

        await db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, level INTEGER, xp INTEGER)');
        console.log('Database ready!');
catch (err) {
    console.error('Database error:', err);
}

})();

    .catch(console.error);
function getRequiredXP(level) {
    return level * level * 100;
}

async function sendLevelUpMessage(userId, newLevel) {
    try {
        const channel = await client.channels.fetch(config.levelUpChannelId);
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setThumbnail('https://media.discordapp.net/attachments/1183588609975140422/1184367662214697071/R.png?ex=658bb757&is=65794257&hm=37b3d7b9482cffd8832e5f6b901d3ff5ceb8c91bd10cb94ed3371019098914a7&=&format=webp&quality=lossless&width=750&height=586')
            .setTitle('Level Up!')
            .setDescription(`<@${userId}> has reached level ${newLevel}! Congratulations!`)
            .setTimestamp();
        await channel.send({ embeds: [embed] });

        if (config.levelRoles[newLevel]) {
            const guild = channel.guild;
            const member = await guild.members.fetch(userId);
            const role = await guild.roles.fetch(config.levelRoles[newLevel]);
            if (role) {
                await member.roles.add(role);
                console.log(`Assigned role ${role.name} to user ${userId} for reaching level ${newLevel}`);
            }
        }
    } catch (error) {
        console.error('Error in sendLevelUpMessage:', error);
    }
}

async function updateUserXP(userId, xpToAdd) {
    try {
        const row = await db.get('SELECT * FROM users WHERE id = ?', userId);
        if (row) {
            let newXP = row.xp + xpToAdd;
            let newLevel = row.level;
            let leveledUp = false;

            while (newXP >= getRequiredXP(newLevel)) {
                newXP -= getRequiredXP(newLevel);
                newLevel++;
                leveledUp = true;
            }

            if (leveledUp) {
                await sendLevelUpMessage(userId, newLevel);
            }

            await db.run('UPDATE users SET xp = ?, level = ? WHERE id = ?', newXP, newLevel, userId);
            console.log(`Updated XP for user ${userId}: Level ${newLevel}, XP ${newXP}`);
        } else {
            await db.run('INSERT INTO users (id, level, xp) VALUES (?, ?, ?)', userId, 1, xpToAdd);
            console.log(`Inserted new user ${userId} with XP ${xpToAdd}`);
        }
    } catch (error) {
        console.error('Error updating user XP:', error);
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (!message.content.startsWith('!') && message.channel.id !== config.levelUpChannelId) {
        await updateUserXP(message.author.id, 10);
    }


    if (message.content === '!xp') {
        const topUsers = await getTopUsers();
        const embed = createXPEmbed(topUsers);
        message.channel.send({ embeds: [embed] });
    }

    if (message.content.startsWith('!clear')) {
        if (message.member.permissions.has('ADMINISTRATOR')) {
            const args = message.content.split(' ');
            if (args.length === 2) {
                const userId = args[1];
                await resetUserXP(userId);
                message.channel.send(`XP and level reset for user with ID: ${userId}`);
            } else {
                message.channel.send('Usage: !clear <userId>');
            }
        } else {
            message.channel.send('You do not have permission to use this command.');
        }
    }

    if (message.content === '!rank') {
        const userData = await getUserData(message.author.id);
        if (userData) {
            const userRank = await getUserRank(message.author.id);
            const embed = createRankEmbed(message.author, userData, userRank);
            message.channel.send({ embeds: [embed] });
        } else {
            message.channel.send("You don't have any XP yet.");
        }
    }
});

async function getUserData(userId) {
    return await db.get('SELECT * FROM users WHERE id = ?', userId);
}

async function getUserRank(userId) {
    const users = await db.all('SELECT * FROM users ORDER BY xp DESC');
    return users.findIndex(user => user.id === userId) + 1;
}

function createRankEmbed(user, userData, rank) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${user.username}'s Rank`)
        .addFields(
            { name: 'Rank', value: `#${rank}`, inline: true },
            { name: 'Level', value: `${userData.level}`, inline: true },
            { name: 'XP', value: `${userData.xp}`, inline: true }
        )
        .setTimestamp();
    return embed;
}

async function getTopUsers() {
    return await db.all('SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10');
}

function createXPEmbed(users) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setThumbnail('https://media.discordapp.net/attachments/1179553732497784906/1184376574636732466/leaderboards-icon-15.png?ex=658bbfa4&is=65794aa4&hm=ef848c1583170f9c834ed33506e47f0329205e2060bf45a543242a34cf137f0f&=&format=webp&quality=lossless&width=675&height=675')
        .setTitle('XP Leaderboard')
        .setDescription('Top users by XP')
        .setTimestamp();

    users.forEach((user, index) => {
        const userMention = `<@${user.id}>`;
        embed.addFields({ 
            name: `${index + 1}. ${user.id}`, 
            value: `${userMention} - Level : ${user.level} | XP : ${user.xp}` 
        });
    });

    return embed;
}



async function resetUserXP(userId) {
    await db.run('UPDATE users SET xp = 0, level = 1 WHERE id = ?', userId);
}
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // هنا تضيف حالة البوت
    client.user.setPresence({
        activities: [
            {
                name: "ｂａｎｄａｒ．ｄｅｖ", // رسالة حالة البوت
                type: 3, // 0 = PLAYING, 1 = STREAMING, 2 = LISTENING, 3 = WATCHING, 5 = COMPETING
            }
        ],
        status: "dnd", // online, idle, dnd, invisible
    });
});

client.login(TOKEN);






















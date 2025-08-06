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
  fullAccess: '1209871038284832908',
  mediumAccess: '1195472593541673031',
};
const badWords = [
  'كلب','قحبة','خنيث','حقير','زق','يلعن','عاهرة','نجس','متناك','تف عليك','كس امك',
  'fuck','bitch','slut','dick','pussy','rape','porn','sex','nigga','cum'
];

// ================== Full Protection System ==================

const OWNER_ID = '1114668397725220954';
const LOG_CHANNEL_ID = '1196376675055845426'; // Replace with your log channel ID

const EMOJI_SPAM_LIMIT = 5;
const CAPS_PERCENTAGE_LIMIT = 70;
const SPAM_LIMIT = 5;
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

  // 3️⃣ Excessive Caps
  const lettersOnly = content.replace(/[^a-zA-Zأ-ي]/g, '');
  const capsCount = (lettersOnly.match(/[A-Zأ-ي]/g) || []).length;
  const capsPercentage = lettersOnly.length > 0 ? (capsCount / lettersOnly.length) * 100 : 0;
  if (capsPercentage > CAPS_PERCENTAGE_LIMIT) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'Excessive capitalization');
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

client.on('guildMemberAdd', async member => {
  try {
    const cachedInvites = invites.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    invites.set(member.guild.id, new Map(newInvites.map(inv => [inv.code, inv.uses])));
    const usedInvite = newInvites.find(i => i.uses > (cachedInvites?.get(i.code) || 0));
    const inviter = usedInvite?.inviter;

    const welcomeChannel = member.guild.channels.cache.get('1195476297133084733'); // اكتب ID قناة الترحيب
    if (!welcomeChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('👋 Welcome | أهلاً!')
      .setDescription(`Welcome ${member} to the server 🎉\nأهلاً بك في السيرفر!\n**Invited by:** ${inviter ? inviter.tag : 'غير معروف'}`)
      .setColor(0x00AE86)
      .setTimestamp();

    welcomeChannel.send({ embeds: [embed] });
  } catch (err) {
    console.log(`❌ Error in welcome: ${err.message}`);
  }
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

  if (command === 'اقفل') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return sendBoth('🔒 تم قفل القناة.', '🔒 Channel locked.');
  }

  if (command === 'افتح') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
    return sendBoth('🔓 تم فتح القناة.', '🔓 Channel unlocked.');
  }

  if (command === 'امسح') {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return sendBoth('❌ رقم بين 1-100', '❌ Number between 1-100.');
    await message.channel.bulkDelete(amount, true);
    return sendBoth(`✅ تم حذف ${amount} رسالة.`, `✅ Deleted ${amount} messages.`);
  }

  if (command === 'كيك') {
    const member = message.mentions.members.first();
    if (!member || !member.kickable) return sendBoth('❌ لا يمكن طرده.', '❌ Cannot kick this user.');
    await member.kick();
    return sendBoth(`✅ تم طرد ${member.user.tag}.`, `✅ Kicked ${member.user.tag}.`);
  }

  if (command === 'باند') {
    const member = message.mentions.members.first();
    if (!member || !member.bannable) return sendBoth('❌ لا يمكن حظره.', '❌ Cannot ban this user.');
    await member.ban();
    return sendBoth(`✅ تم حظر ${member.user.tag}.`, `✅ Banned ${member.user.tag}.`);
  }

  if (command === 'فك-باند') {
    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId) return sendBoth('❌ اكتب ID العضو.', '❌ Provide user ID.');
    try {
      await message.guild.bans.remove(userId);
      return sendBoth(`✅ تم فك الحظر عن ${userId}.`, `✅ Unbanned ${userId}.`);
    } catch {
      return sendBoth('❌ فشل في فك الحظر.', '❌ Failed to unban.');
    }
  }

  if (command === 'تايم-اوت') {
    const member = message.mentions.members.first();
    const time = parseInt(args[1]);
    if (!member || isNaN(time)) return sendBoth('❌ منشن العضو والمدة.', '❌ Mention user and duration.');
    await member.timeout(time, `Timeout by ${message.author.tag}`);
    return sendBoth(`✅ تم إعطاء ${member.user.tag} تايم أوت.`, `✅ Timeout given to ${member.user.tag}.`);
  }

  if (command === 'نشر') {
    const content = args.join(' ');
    if (!content) return message.reply('❌ اكتب الرسالة بعد الأمر.');
    await message.delete().catch(() => {});
    const embed = new EmbedBuilder()
      .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() })
      .setDescription(content)
      .setColor('#2F3136')
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('accept_rules')
        .setLabel('✅ أوافق على القوانين')
        .setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  if (command === 'help' || command === 'مساعدة') {
    await message.delete().catch(() => {});
    return message.channel.send(`
🔧 **Available Commands | الأوامر المتاحة:**

\`&ping\`
\`&اقفل / &افتح\`
\`&امسح 10\`
\`&نشر @message\`
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
    // await interaction.member.roles.add('ROLE_ID');
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
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);





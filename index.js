const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, AuditLogEvent } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;

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
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const prefix = '&';
const invites = new Map();

// ==================== [ إعدادات القنوات والرتب ] ====================
const logChannels = {
  banLogChannelId: '1196375859104317461',
  unbanLogChannelId: '1196376525461786734',
  memberRemoveLogChannelId: '1196376358348140544',
  roleDeleteLogChannelId: '1196376183575674880',
  roleCreateLogChannelId: '1196376068882448444',
  channelDeleteLogChannelId: '1196376095969255455',
  channelCreateLogChannelId: '1196376023693013172',
  channelUpdateLogChannelId: '1196376605208096818',
  roleUpdateLogChannelId: '1196376630411673650',
  nicknameUpdateLogChannelId: '1196376380351451208',
  voiceLogChannelId: '1196376765401153586',
  messageDeleteLogChannelId: '1196376149702475818',
  messageUpdateLogChannelId: '1196376203460870195',
  timeoutLogChannelId: '1196375994232225802',
  kickLogChannelId: '1196376279646228511',
  protectionLogChannelId: '1196376675055845426',
  inviteLogChannelId: '1196376497338986517',
  guildUpdateLogChannelId: '1209859968560537620',
  voiceMoveLogChannelId: '1196376044144439497',
  voiceDisconnectLogChannelId: '1196376580193271838',
  voiceMuteLogChannelId: '1196376116248707072',
};

const roleIds = {
  fullAccess: '1209871038284832908',
  mediumAccess: '1195472593541673031',
};

const badWords = [
  'كلب','قحبة','خنيث','حقير','زق','يلعن','يا ابن','عاهرة','وسخ','نجس','عرص','متناك','متحول','تف عليك','تفو','قواد','شرموطة','منيوك','منيك','كسمك','كس اختك','حيوان','مخنث','شرموط','لوطي','كس امك','انيكك','افضحك','زامل',
  'fuck','bitch','asshole','bastard','slut','whore','dick','pussy','faggot','motherfucker','cunt','nigger','retard','suck','cum','nigga','blowjob','rape','molest','pedo','porn','sex','dildo','cock','boobs','tits','jerk','anal'
];

const MAX_ACTIONS = 3;
const ACTION_RESET_TIME = 10000;

const invitesMap = new Map();
const userMessages = new Map();
const actionTracker = new Map();

// ==================== [ دوال مساعدة ] ====================
function createLogEmbed(title, description, color = 'Grey') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

async function hasPermission(member, command) {
  await member.fetch(); // تأكد من تحميل البيانات
  const hasFull = member.roles.cache.has(roleIds.fullAccess);
  const hasMedium = member.roles.cache.has(roleIds.mediumAccess);

  const forbiddenForFull = ['باند', 'كيك', 'مانج-السيرفر'];
  const forbiddenForMedium = ['باند', 'كيك', 'امسح', 'تايم-اوت', 'مانج-السيرفر'];

  if (hasFull) {
    if (forbiddenForFull.includes(command)) return false;
    return true;
  }
  if (hasMedium) {
    if (forbiddenForMedium.includes(command)) return false;
    return true;
  }
  return false;
}


function trackAction(userId, type) {
  const key = `${userId}_${type}`;
  const data = actionTracker.get(key) || { count: 0, last: Date.now() };
  const now = Date.now();

  if (now - data.last < TIME_WINDOW) {
    data.count++;
  } else {
    data.count = 1;
  }
  data.last = now;
  actionTracker.set(key, data);
  return data.count;
}

async function timeoutMember(guild, userId, duration, reason) {
  try {
    const member = await guild.members.fetch(userId);
    if (member && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await member.timeout(duration, reason);
    }
  } catch (err) {
    console.error('Timeout failed:', err);
  }
}

async function punishUser(guild, userId, reason) {
  try {
    const member = await guild.members.fetch(userId);
    if (member && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await member.roles.set([]).catch(() => {});
      const protectionChannel = guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`🚨 **${member.user.tag}** تم سحب صلاحياته بسبب: ${reason}`);
    }
  } catch (err) {
    console.error('Failed to punish user:', err);
  }
}

// ==================== [ Events ] ====================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    try {
      const firstInvites = await guild.invites.fetch();
      invitesMap.set(guild.id, new Map(firstInvites.map(inv => [inv.code, inv.uses])));
    } catch (error) {
      console.log(`❌ Couldn't fetch invites for ${guild.name}: ${error.message}`);
    }
  }
});

// (بقية messageCreate و الأوامر موجودة فوق)

client.on('guildBanAdd', async (ban) => {
  const channel = client.channels.cache.get(logChannels.banLogChannelId);
  if (!channel) return;
  const fetchedLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const banLog = fetchedLogs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = banLog?.executor;
  const reason = banLog?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('🚫 تم حظر عضو', `تم حظر العضو **${ban.user.tag}** بواسطة ${executor?.tag || 'شخص مجهول'}\n**السبب:** ${reason}`, 'Red');
  channel.send({ embeds: [embed] });
});

client.on('guildBanRemove', async (ban) => {
  const channel = client.channels.cache.get(logChannels.unbanLogChannelId);
  if (!channel) return;
  const fetchedLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
  const unbanLog = fetchedLogs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = unbanLog?.executor;
  const reason = unbanLog?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('✅ تم رفع الحظر', `تم فك الحظر عن العضو **${ban.user.tag}** بواسطة ${executor?.tag || 'شخص مجهول'}\n**السبب:** ${reason}`, 'Green');
  channel.send({ embeds: [embed] });
});

client.on('roleDelete', async role => {
  const channel = client.channels.cache.get(logChannels.roleDeleteLogChannelId);
  if (!channel) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = auditLogs.entries.first();
  const executor = entry?.executor;
  const reason = entry?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('⚠️ تم حذف رتبة', `تم حذف رتبة **${role.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'DarkRed');
  channel.send({ embeds: [embed] });

  if (executor && !executor.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    try {
      await role.guild.members.cache.get(executor.id)?.roles.cache.forEach(role => {
        if (role.editable) role.delete().catch(() => {});
      });
      const protectionChannel = role.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`⚠️ تم سحب صلاحيات ${executor.tag} بسبب حذف رتبة بدون إذن.`);
    } catch {}
  }
});

client.on('roleCreate', async role => {
  const channel = client.channels.cache.get(logChannels.roleCreateLogChannelId);
  if (!channel) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const reason = auditLogs.entries.first()?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('✅ تم إنشاء رتبة', `تم إنشاء رتبة **${role.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'Green');
  channel.send({ embeds: [embed] });
});

client.on('roleUpdate', async (oldRole, newRole) => {
  const channel = client.channels.cache.get(logChannels.roleUpdateLogChannelId);
  if (!channel) return;
  const auditLogs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const reason = auditLogs.entries.first()?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('⚠️ تم تعديل رتبة', `تم تعديل رتبة **${oldRole.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'Yellow');
  channel.send({ embeds: [embed] });
});

client.on('channelDelete', async channelDeleted => {
  const channel = client.channels.cache.get(logChannels.channelDeleteLogChannelId);
  if (!channel) return;
  const auditLogs = await channelDeleted.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = auditLogs.entries.first();
  const executor = entry?.executor;
  const reason = entry?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('⚠️ تم حذف روم', `تم حذف روم **${channelDeleted.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'DarkRed');
  channel.send({ embeds: [embed] });

  if (executor && !executor.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    try {
      await channelDeleted.guild.members.cache.get(executor.id)?.roles.cache.forEach(role => {
        if (role.editable) role.delete().catch(() => {});
      });
      const protectionChannel = channelDeleted.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`⚠️ تم سحب صلاحيات ${executor.tag} بسبب حذف روم بدون إذن.`);
    } catch {}
  }
});

client.on('channelCreate', async channelCreated => {
  const channel = client.channels.cache.get(logChannels.channelCreateLogChannelId);
  if (!channel) return;
  const auditLogs = await channelCreated.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('✅ تم إنشاء روم', `تم إنشاء روم **${channelCreated.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'Green');
  channel.send({ embeds: [embed] });

  if (executor && trackAction(executor.id, 'channelCreate') >= MAX_ACTIONS) {
    await punishUser(channelCreated.guild, executor.id, 'إنشاء رومات بشكل مفرط');
  }
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  const channel = client.channels.cache.get(logChannels.channelUpdateLogChannelId);
  if (!channel) return;
  const auditLogs = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('⚠️ تم تعديل روم', `تم تعديل روم **${oldChannel.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'Yellow');
  channel.send({ embeds: [embed] });
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    const channel = client.channels.cache.get(logChannels.nicknameUpdateLogChannelId);
    if (!channel) return;
    const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
    const executor = auditLogs.entries.first()?.executor;
    const embed = createLogEmbed('⚠️ تم تغيير الاسم المستعار', `تم تغيير الاسم المستعار للعضو **${newMember.user.tag}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.\n\n**من:** ${oldMember.nickname || 'لا يوجد'}\n**إلى:** ${newMember.nickname || 'لا يوجد'}`, 'Yellow');
    channel.send({ embeds: [embed] });
  }

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;
  if (oldTimeout !== newTimeout) {
    const channel = client.channels.cache.get(logChannels.timeoutLogChannelId);
    if (!channel) return;
    if (newTimeout && (newTimeout > Date.now())) {
      const until = new Date(newTimeout).toLocaleString();
      const embed = createLogEmbed('⏳ تم إعطاء تايم أوت', `تم إعطاء تايم أوت للعضو **${newMember.user.tag}** حتى ${until}.`, 'Orange');
      channel.send({ embeds: [embed] });
    } else {
      const embed = createLogEmbed('⏳ تم رفع التايم أوت', `تم رفع التايم أوت عن العضو **${newMember.user.tag}**.`, 'Green');
      channel.send({ embeds: [embed] });
    }
  }
});
// === ترحيب + اسم الدعوة ===
client.on('guildMemberAdd', async member => {
  try {
    const cachedInvites = invites.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    invites.set(member.guild.id, new Map(newInvites.map(inv => [inv.code, inv.uses])));
    const usedInvite = newInvites.find(i => i.uses > (cachedInvites?.get(i.code) || 0));
    const inviter = usedInvite?.inviter;

    const welcomeChannel = member.guild.channels.cache.get('1195476297133084733'); // غيره للقناة الترحيب
    if (!welcomeChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('👋 Welcome | أهلاً!')
      .setDescription(`Welcome ${member} to the server 🎉\nأهلاً بك في السيرفر!\n**Invited by:** ${inviter ? inviter.tag : 'Unknown | غير معروف'}`)
      .setColor(0x00AE86)
      .setTimestamp();

    welcomeChannel.send({ embeds: [embed] });
  } catch (err) {
    console.log(`❌ Error in welcome: ${err.message}`);
  }
});

// دالة تتحقق الصلاحيات حسب الرتبة والأمر
function hasPermission(member, command) {
  const hasFull = member.roles.cache.has(roleIds.fullAccess);
  const hasMedium = member.roles.cache.has(roleIds.mediumAccess);

  // أوامر ممنوعة لـ Full access:
  const forbiddenForFull = ['باند', 'كيك', 'مانج-السيرفر'];

  // أوامر ممنوعة لـ Medium access:
  const forbiddenForMedium = ['باند', 'كيك', 'امسح', 'تايم-اوت', 'مانج-السيرفر'];

  if (hasFull) {
    if (forbiddenForFull.includes(command)) return false;
    return true;
  }

  if (hasMedium) {
    if (forbiddenForMedium.includes(command)) return false;
    return true;
  }

  // لأي عضو بدون رتبة مخصصة، ممنوع كل شيء
  return false;
}

// ================== Anti-Spam Protection System ==================

const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const EMOJI_SPAM_LIMIT = 5;
const MENTION_SPAM_LIMIT = 2;
const CAPS_PERCENTAGE_LIMIT = 70;
const SPAM_LIMIT = 5;
const TIME_WINDOW = 5000; // 5 ثواني

const userMessages = new Map();

// دالة حذف جميع رسائل العضو في الروم (حتى 100 رسالة)
async function deleteUserMessages(channel, userId) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const userMessages = messages.filter(m => m.author.id === userId);
  if (userMessages.size > 0) {
    await channel.bulkDelete(userMessages, true).catch(() => {});
  }
}

// دالة Timeout للعقاب
async function timeoutMember(guild, userId, duration, reason) {
  try {
    const member = await guild.members.fetch(userId);
    if (member && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await member.timeout(duration, reason);
    }
  } catch (err) {
    console.error('Timeout failed:', err);
  }
}

// ================== Event: messageCreate ==================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content;

  // 1️⃣ منع @everyone و @here
  if (message.mentions.everyone) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'إرسال @everyone');
    return;
  }

  // 2️⃣ الروابط
  if (/https?:\/\/|discord\.gg/i.test(content)) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'إرسال روابط ممنوعة');
    return;
  }

  // 3️⃣ الكابيتال
  const lettersOnly = content.replace(/[^a-zA-Zأ-ي]/g, '');
  const capsCount = (lettersOnly.match(/[A-Zأ-ي]/g) || []).length;
  const capsPercentage = lettersOnly.length > 0 ? (capsCount / lettersOnly.length) * 100 : 0;
  if (capsPercentage > CAPS_PERCENTAGE_LIMIT) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'إرسال رسائل بحروف كابيتال مفرطة');
    return;
  }

  // 4️⃣ سبام الإيموجي
  const emojiCount = (message.content.match(/<a?:.+?:\d+>|[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;
  if (emojiCount >= EMOJI_SPAM_LIMIT) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'سبام إيموجي');
    return;
  }

  // 5️⃣ سبام الرسائل
  const now = Date.now();
  const timestamps = userMessages.get(message.author.id) || [];
  const updated = timestamps.filter(t => now - t < TIME_WINDOW);
  updated.push(now);
  userMessages.set(message.author.id, updated);

  if (updated.length >= SPAM_LIMIT) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    await timeoutMember(message.guild, message.author.id, 86400000, 'سبام رسائل');
    return;
  }
});


if (!message.content.startsWith(prefix)) return;


  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!message.member) return;

  if (!hasPermission(message.member, command)) {
    return message.reply('❌ ما عندك صلاحية استخدام هذا الأمر.');
  }

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

if (command === 'نشر') {
    const content = message.content.slice(prefix.length + command.length).trim();
    if (!content) return message.reply('❌ اكتب الرسالة بعد الأمر.');

    await message.delete().catch(() => {}); // حذف رسالة المستخدم

    const embed = new EmbedBuilder()
        .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() })
        .setDescription(content)
        .setColor('#2F3136')
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('accept_rules')
                .setLabel('✅ أوافق على القوانين')
                .setStyle(ButtonStyle.Success)
        );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
}

// التفاعل مع زر الموافقة
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'accept_rules') {
        await interaction.reply({ content: `✅ لقد وافقت على القوانين بنجاح.`, ephemeral: true });
        // تقدر هنا تعطيه رتبة معينة إذا تبي
        // await interaction.member.roles.add('ROLE_ID');
    }
});

  if (command === 'ping') {
    return sendBoth('🏓 البوت شغال تمام!', '🏓 Bot is up and running!');
  }

  if (command === 'اقفل') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return sendBoth('🔒 تم قفل القناة.', '🔒 Channel has been locked.');
  }

  if (command === 'افتح') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
    return sendBoth('🔓 تم فتح القناة.', '🔓 Channel has been unlocked.');
  }

  if (command === 'امسح') {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100)
      return sendBoth('❌ أدخل رقم بين 1-100', '❌ Enter a number between 1-100.');
    await message.channel.bulkDelete(amount, true);
    return sendBoth(`✅ تم حذف ${amount} رسالة.`, `✅ Deleted ${amount} messages.`);
  }

  if (command === 'كيك') {
    const member = message.mentions.members.first();
    if (!member) return sendBoth('❌ منشن عضو لطرده.', '❌ Mention a user to kick.');
    if (!member.kickable) return sendBoth('❌ لا أستطيع طرد هذا العضو.', '❌ I cannot kick this user.');
    await member.kick();
    return sendBoth(`✅ تم طرد ${member.user.tag}.`, `✅ Kicked ${member.user.tag}.`);
  }

  if (command === 'باند') {
    const member = message.mentions.members.first();
    if (!member) return sendBoth('❌ منشن عضو لحظره.', '❌ Mention a user to ban.');
    if (!member.bannable) return sendBoth('❌ لا أستطيع حظر هذا العضو.', '❌ I cannot ban this user.');
    await member.ban();
    return sendBoth(`✅ تم حظر ${member.user.tag}.`, `✅ Banned ${member.user.tag}.`);
  }

  if (command === 'فك-باند') {
    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId) return sendBoth('❌ أدخل ID العضو لفك الحظر.', '❌ Provide a user ID to unban.');
    try {
      await message.guild.bans.remove(userId);
      return sendBoth(`✅ تم فك الحظر عن العضو برقم ${userId}.`, `✅ Unbanned user with ID ${userId}.`);
    } catch {
      return sendBoth('❌ لم أتمكن من فك الحظر عن هذا العضو.', '❌ Could not unban this user.');
    }
  }

  if (command === 'تايم-اوت') {
    const member = message.mentions.members.first();
    const time = parseInt(args[1]);
    if (!member || isNaN(time) || time < 1000)
      return sendBoth('❌ منشن عضو ومدة صحيحة بالمللي ثانية.', '❌ Mention a user and valid time in ms.');
    if (!member.manageable) return sendBoth('❌ لا أستطيع إعطاء تايم آوت لهذا العضو.', '❌ I cannot timeout this user.');
    await member.timeout(time, `Timeout by ${message.author.tag}`);
    return sendBoth(`✅ تم إعطاء ${member.user.tag} تايم آوت.`, `✅ Timeout given to ${member.user.tag}.`);
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


// === نظام اللوقز ===

// Helper function لإنشاء إيمبد لوق
function createLogEmbed(title, description, color = 'Grey') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

// بان عضو
client.on('guildBanAdd', async (ban) => {
  const channel = client.channels.cache.get(logChannels.banLogChannelId);
  if (!channel) return;
  const fetchedLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const banLog = fetchedLogs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = banLog?.executor;
  const reason = banLog?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('🚫 تم حظر عضو', `تم حظر العضو **${ban.user.tag}** بواسطة ${executor?.tag || 'شخص مجهول'}\n**السبب:** ${reason}`, 'Red');
  channel.send({ embeds: [embed] });
});

// فك باند
client.on('guildBanRemove', async (ban) => {
  const channel = client.channels.cache.get(logChannels.unbanLogChannelId);
  if (!channel) return;
  const fetchedLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
  const unbanLog = fetchedLogs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = unbanLog?.executor;
  const reason = unbanLog?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('✅ تم رفع الحظر', `تم فك الحظر عن العضو **${ban.user.tag}** بواسطة ${executor?.tag || 'شخص مجهول'}\n**السبب:** ${reason}`, 'Green');
  channel.send({ embeds: [embed] });
});

// خروج أو طرد عضو
client.on('guildMemberRemove', async member => {
  const fetchedLogs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const kickLog = fetchedLogs.entries.find(entry => entry.target.id === member.id);
  const executor = kickLog?.executor;
  const reason = kickLog?.reason || 'لم يتم تحديد السبب';

  const channel = client.channels.cache.get(logChannels.memberRemoveLogChannelId);
  if (!channel) return;

  let description = `👢 العضو **${member.user.tag}** خرج أو تم طرده.`;
  if (kickLog) {
    description = `👢 تم طرد العضو **${member.user.tag}** بواسطة ${executor?.tag || 'شخص مجهول'}\n**السبب:** ${reason}`;
  }

  const embed = createLogEmbed('👢 عضو خرج أو تم طرده', description, 'Orange');
  channel.send({ embeds: [embed] });
});

// حذف رتبة
client.on('roleDelete', async role => {
  const channel = client.channels.cache.get(logChannels.roleDeleteLogChannelId);
  if (!channel) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = auditLogs.entries.first();
  const executor = entry?.executor;
  const reason = entry?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('⚠️ تم حذف رتبة', `تم حذف رتبة **${role.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'DarkRed');
  channel.send({ embeds: [embed] });

  if (executor && !executor.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    try {
      await role.guild.members.cache.get(executor.id)?.roles.cache.forEach(role => {
        if (role.editable) role.delete().catch(() => {});
      });
      const protectionChannel = role.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`⚠️ تم سحب صلاحيات ${executor.tag} بسبب حذف رتبة بدون إذن.`);
    } catch {}
  }
});

// إنشاء رتبة
client.on('roleCreate', async role => {
  const channel = client.channels.cache.get(logChannels.roleCreateLogChannelId);
  if (!channel) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const reason = auditLogs.entries.first()?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('✅ تم إنشاء رتبة', `تم إنشاء رتبة **${role.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'Green');
  channel.send({ embeds: [embed] });
});

// تعديل رتبة
client.on('roleUpdate', async (oldRole, newRole) => {
  const channel = client.channels.cache.get(logChannels.roleUpdateLogChannelId);
  if (!channel) return;
  const auditLogs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const reason = auditLogs.entries.first()?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('⚠️ تم تعديل رتبة', `تم تعديل رتبة **${oldRole.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'Yellow');
  channel.send({ embeds: [embed] });
});

// حذف روم
client.on('channelDelete', async channelDeleted => {
  const channel = client.channels.cache.get(logChannels.channelDeleteLogChannelId);
  if (!channel) return;
  const auditLogs = await channelDeleted.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = auditLogs.entries.first();
  const executor = entry?.executor;
  const reason = entry?.reason || 'لم يتم تحديد السبب';
  const embed = createLogEmbed('⚠️ تم حذف روم', `تم حذف روم **${channelDeleted.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}\n**السبب:** ${reason}`, 'DarkRed');
  channel.send({ embeds: [embed] });

  if (executor && !executor.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    try {
      await channelDeleted.guild.members.cache.get(executor.id)?.roles.cache.forEach(role => {
        if (role.editable) role.delete().catch(() => {});
      });
      const protectionChannel = channelDeleted.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`⚠️ تم سحب صلاحيات ${executor.tag} بسبب حذف روم بدون إذن.`);
    } catch {}
  }
});


// إنشاء روم
client.on('channelCreate', async channelCreated => {
  const channel = client.channels.cache.get(logChannels.channelCreateLogChannelId);
  if (!channel) return;
  const auditLogs = await channelCreated.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('✅ تم إنشاء روم', `تم إنشاء روم **${channelCreated.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'Green');
  channel.send({ embeds: [embed] });
});

// تعديل روم
client.on('channelUpdate', async (oldChannel, newChannel) => {
  const channel = client.channels.cache.get(logChannels.channelUpdateLogChannelId);
  if (!channel) return;
  const auditLogs = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('⚠️ تم تعديل روم', `تم تعديل روم **${oldChannel.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'Yellow');
  channel.send({ embeds: [embed] });
});

// تغيير نيك نيم
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.nickname === newMember.nickname) return;
  const channel = client.channels.cache.get(logChannels.nicknameUpdateLogChannelId);
  if (!channel) return;
  const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed(
    '⚠️ تم تغيير الاسم المستعار',
    `تم تغيير الاسم المستعار للعضو **${newMember.user.tag}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.\n\n**من:** ${oldMember.nickname || 'لا يوجد'}\n**إلى:** ${newMember.nickname || 'لا يوجد'}`,
    'Yellow'
  );
  channel.send({ embeds: [embed] });
});

// حذف رسالة
client.on('messageDelete', async message => {
  if (!message.guild) return;
  const channel = client.channels.cache.get(logChannels.messageDeleteLogChannelId);
  if (!channel) return;
  const embed = createLogEmbed('🗑️ تم حذف رسالة', `الرسالة التي كتبها **${message.author?.tag || 'مجهول'}** في قناة **${message.channel.name}** تم حذفها.`, 'Grey');
  channel.send({ embeds: [embed] });
});

// تعديل رسالة
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;
  const channel = client.channels.cache.get(logChannels.messageUpdateLogChannelId);
  if (!channel) return;
  const embed = createLogEmbed(
    '✏️ تم تعديل رسالة',
    `العضو **${newMessage.author.tag}** عدل رسالة في قناة **${newMessage.channel.name}**\n\n**قبل:** ${oldMessage.content || 'لا يوجد'}\n**بعد:** ${newMessage.content || 'لا يوجد'}`,
    'Yellow'
  );
  channel.send({ embeds: [embed] });
});

// تايم آوت (وقت إيقاف مؤقت)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const channel = client.channels.cache.get(logChannels.timeoutLogChannelId);
  if (!channel) return;
  const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;
  if (oldTimeout !== newTimeout) {
    if (newTimeout && (newTimeout > Date.now())) {
      const until = new Date(newTimeout).toLocaleString();
      const embed = createLogEmbed('⏳ تم إعطاء تايم أوت', `تم إعطاء تايم أوت للعضو **${newMember.user.tag}** حتى ${until}.`, 'Orange');
      channel.send({ embeds: [embed] });
    } else {
      const embed = createLogEmbed('⏳ تم رفع التايم أوت', `تم رفع التايم أوت عن العضو **${newMember.user.tag}**.`, 'Green');
      channel.send({ embeds: [embed] });
    }
  }
});

// طرد عضو (لو تبي لوق طرد خاص غير خروج عادي)
// هنا نفس الـ guildMemberRemove تم تغطيته

// أحداث صوتية (دخول/خروج/تحويل/ميوت)
client.on('voiceStateUpdate', async (oldState, newState) => {
  const channelJoin = client.channels.cache.get(logChannels.voiceLogChannelId);
  if (!channelJoin) return;

  // دخول قناة صوتية
  if (!oldState.channelId && newState.channelId) {
    const embed = createLogEmbed('🔊 دخل صوتي', `${newState.member.user.tag} دخل قناة **${newState.channel.name}**`, 'Green');
    channelJoin.send({ embeds: [embed] });
  }
  // خروج من قناة صوتية
  else if (oldState.channelId && !newState.channelId) {
    const embed = createLogEmbed('🔇 خرج صوتي', `${newState.member.user.tag} خرج من قناة **${oldState.channel.name}**`, 'Red');
    channelJoin.send({ embeds: [embed] });
  }
  // نقل بين رومات
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const embed = createLogEmbed('🔄 تم النقل صوتياً', `${newState.member.user.tag} نُقل من **${oldState.channel.name}** إلى **${newState.channel.name}**`, 'Orange');
    channelJoin.send({ embeds: [embed] });
  }
  // ميوت / أن ميوت (ميكروفون)
  if (oldState.selfMute !== newState.selfMute) {
    const embed = createLogEmbed(
      newState.selfMute ? '🔇 تم كتم الميكروفون' : '🔊 تم إلغاء كتم الميكروفون',
      `${newState.member.user.tag} ${newState.selfMute ? 'تم كتم ميكروفونه' : 'تم إلغاء كتم ميكروفونه'}`,
      newState.selfMute ? 'Red' : 'Green'
    );
    channelJoin.send({ embeds: [embed] });
  }
  // ميوت / أن ميوت (سبيكر)
  if (oldState.selfDeaf !== newState.selfDeaf) {
    const embed = createLogEmbed(
      newState.selfDeaf ? '🔇 تم كتم السماعة' : '🔊 تم إلغاء كتم السماعة',
      `${newState.member.user.tag} ${newState.selfDeaf ? 'تم كتم سماعته' : 'تم إلغاء كتم سماعته'}`,
      newState.selfDeaf ? 'Red' : 'Green'
    );
    channelJoin.send({ embeds: [embed] });
  }
});

// مراقبة تغيير إعدادات السيرفر (guildUpdate)
client.on('guildUpdate', async (oldGuild, newGuild) => {
  const channel = client.channels.cache.get(logChannels.guildUpdateLogChannelId);
  if (!channel) return;

  let changes = [];

  if (oldGuild.name !== newGuild.name) changes.push(`اسم السيرفر من **${oldGuild.name}** إلى **${newGuild.name}**`);
  if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push('تغيير صورة السيرفر');
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) changes.push(`رابط السيرفر المخصص من **${oldGuild.vanityURLCode}** إلى **${newGuild.vanityURLCode}**`);

  if (changes.length === 0) return;

  const embed = createLogEmbed('⚙️ تم تعديل إعدادات السيرفر', changes.join('\n'), 'Yellow');
  channel.send({ embeds: [embed] });
});

// مراقبة الدعوات (إنشاؤها وحذفها)
client.on('inviteCreate', async invite => {
  const channel = client.channels.cache.get(logChannels.inviteLogChannelId);
  if (!channel) return;

  const embed = createLogEmbed('➕ تم إنشاء دعوة', `تم إنشاء دعوة جديدة برابط: https://discord.gg/${invite.code}\nصاحب الدعوة: ${invite.inviter.tag}`, 'Green');
  channel.send({ embeds: [embed] });
});

client.on('inviteDelete', async invite => {
  const channel = client.channels.cache.get(logChannels.inviteLogChannelId);
  if (!channel) return;

  const embed = createLogEmbed('➖ تم حذف دعوة', `تم حذف دعوة برابط: https://discord.gg/${invite.code}`, 'Red');
  channel.send({ embeds: [embed] });

});

// === حماية أساسية ضد حذف الرتب والرومات بدون إذن (تطبق في أحداث roleDelete و channelDelete سابقاً) ===

// * الكود ردع الحماية وضعته ضمن event roleDelete و channelDelete *



// === تسجيل الدخول ===
client.login(TOKEN);


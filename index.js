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

// === قنوات اللوق + قناة الحماية (عدل الـ IDs حسب سيرفرك) ===
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
  protectionLogChannelId: '1196376000000000000', // حط هنا ايدى قناة الحماية
  inviteLogChannelId: '1196376100000000000', // قناة لوق الدعوات
  guildUpdateLogChannelId: '1196376110000000000', // قناة تعديل إعدادات السيرفر
  voiceMoveLogChannelId: '1196376120000000000',
  voiceDisconnectLogChannelId: '1196376130000000000',
  voiceMuteLogChannelId: '1196376140000000000',
};

// === عند تشغيل البوت ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // تحميل الدعوات لكل سيرفر
  for (const guild of client.guilds.cache.values()) {
    try {
      const firstInvites = await guild.invites.fetch();
      invites.set(guild.id, new Map(firstInvites.map(inv => [inv.code, inv.uses])));
      console.log(`✅ Loaded invites for ${guild.name}`);
    } catch (error) {
      console.log(`❌ Couldn't fetch invites for ${guild.name}: ${error.message}`);
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

// === أوامر الإدارة ===
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return message.reply('❌ لا تملك صلاحيات | You lack permission.');
  }

  const sendBoth = (msgAr, msgEn) => message.channel.send(`**${msgAr}**\n${msgEn}`);

  if (command === 'ping') return sendBoth('🏓 البوت شغال تمام!', '🏓 Bot is up and running!');

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
    return message.channel.send(`
🔧 **Available Commands | الأوامر المتاحة:**
\`&ping\` - Ping البوت  
\`&اقفل / &افتح\` - Lock / Unlock channel  
\`&امسح 10\` - Delete 10 messages  
\`&كيك @user\` - Kick user  
\`&باند @user\` - Ban user  
\`&تايم-اوت @user 60000\` - Timeout user (ms)
    `);
  }

  sendBoth('❓ الأمر غير معروف.', '❓ Unknown command.');
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
  const embed = createLogEmbed('🚫 تم حظر عضو', `تم حظر العضو **${ban.user.tag}** من السيرفر.`, 'Red');
  channel.send({ embeds: [embed] });
});

// فك باند
client.on('guildBanRemove', async (ban) => {
  const channel = client.channels.cache.get(logChannels.unbanLogChannelId);
  if (!channel) return;
  const embed = createLogEmbed('✅ تم رفع الحظر', `تم فك الحظر عن العضو **${ban.user.tag}**.`, 'Green');
  channel.send({ embeds: [embed] });
});

// خروج أو طرد عضو
client.on('guildMemberRemove', member => {
  const channel = client.channels.cache.get(logChannels.memberRemoveLogChannelId);
  if (!channel) return;
  const embed = createLogEmbed('👢 عضو خرج أو تم طرده', `العضو **${member.user.tag}** خرج أو تم طرده.`, 'Orange');
  channel.send({ embeds: [embed] });
});

// حذف رتبة
client.on('roleDelete', async role => {
  const channel = client.channels.cache.get(logChannels.roleDeleteLogChannelId);
  if (!channel) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('⚠️ تم حذف رتبة', `تم حذف رتبة **${role.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'DarkRed');
  channel.send({ embeds: [embed] });

  // حماية حذف الرتب - لو تبي ردع (حذف صلاحيات مثلا)
  if (executor && !executor.permissions.has(PermissionsBitField.Flags.Administrator)) {
    try {
      await role.guild.members.cache.get(executor.id)?.roles.cache.forEach(role => {
        if (role.editable) role.delete().catch(() => {});
      });
      const protectionChannel = role.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`⚠️ تم سحب صلاحيات ${executor.tag} بسبب حذف رتبة بدون إذن.`);
    } catch {
      // فشل في الردع، تجاهل
    }
  }
});

// إنشاء رتبة
client.on('roleCreate', async role => {
  const channel = client.channels.cache.get(logChannels.roleCreateLogChannelId);
  if (!channel) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('✅ تم إنشاء رتبة', `تم إنشاء رتبة **${role.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'Green');
  channel.send({ embeds: [embed] });
});

// تعديل رتبة
client.on('roleUpdate', async (oldRole, newRole) => {
  const channel = client.channels.cache.get(logChannels.roleUpdateLogChannelId);
  if (!channel) return;
  const auditLogs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('⚠️ تم تعديل رتبة', `تم تعديل رتبة **${oldRole.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'Yellow');
  channel.send({ embeds: [embed] });
});

// حذف روم
client.on('channelDelete', async channelDeleted => {
  const channel = client.channels.cache.get(logChannels.channelDeleteLogChannelId);
  if (!channel) return;
  const auditLogs = await channelDeleted.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const executor = auditLogs.entries.first()?.executor;
  const embed = createLogEmbed('⚠️ تم حذف روم', `تم حذف روم **${channelDeleted.name}** بواسطة ${executor ? executor.tag : 'شخص مجهول'}.`, 'DarkRed');
  channel.send({ embeds: [embed] });

  // حماية حذف الرومات
  if (executor && !executor.permissions.has(PermissionsBitField.Flags.Administrator)) {
    try {
      await channelDeleted.guild.members.cache.get(executor.id)?.roles.cache.forEach(role => {
        if (role.editable) role.delete().catch(() => {});
      });
      const protectionChannel = channelDeleted.guild.channels.cache.get(logChannels.protectionLogChannelId);
      protectionChannel?.send(`⚠️ تم سحب صلاحيات ${executor.tag} بسبب حذف روم بدون إذن.`);
    } catch {
      // تجاهل الفشل
    }
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

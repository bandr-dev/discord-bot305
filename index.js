const {
  Client, GatewayIntentBits, Partials, PermissionsBitField,
  EmbedBuilder, AuditLogEvent, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");

const config = require("./config.json");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const TOKEN = process.env.DISCORD_TOKEN || "YOUR_BOT_TOKEN";

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
const userMessages = new Map();

// ================== Anti-Nuke Protection ==================
client.on("guildAuditLogEntryCreate", async entry => {
  const destructiveActions = [
    AuditLogEvent.RoleDelete,
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.MemberBanAdd,
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.BotAdd,
    AuditLogEvent.EmojiDelete
  ];

  if (!destructiveActions.includes(entry.action)) return;

  const executor = entry.executor;
  if (!executor || executor.bot || executor.id === config.ownerId) return;

  const guild = entry.guild;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (!member) return;
  if (member.roles.cache.some(r => config.bypassRoleIds.includes(r.id))) return;

  try {
    await member.roles.set([config.nukePunishmentRoleId]);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    await member.timeout(weekMs, "Nuke Protection - Destructive Action");

    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("🚨 Nuke Attempt Detected")
      .setDescription(`User: ${executor.tag} حاول يسوي أكشن خطير وتم معاقبته.`)
      .addFields(
        { name: "👤 User", value: `${executor.tag} (${executor.id})` },
        { name: "📄 Reason", value: "Nuke Protection" },
        { name: "⏱ Duration", value: "7 days" },
        { name: "🏷 Action", value: entry.action.toString() }
      )
      .setColor("Red")
      .setTimestamp();

    logChannel.send({
      content: config.adminRoleIds.map(r => `<@&${r}>`).join(" "),
      embeds: [embed]
    });
  } catch (err) {
    console.error("Anti-nuke error:", err);
  }
});

// -------------------------------------------------------------------------------------------

async function deleteUserMessages(channel, userId) {
  const messages = await channel.messages.fetch({ limit: 30 });
  const userMsgs = messages.filter(m => m.author.id === userId);
  if (userMsgs.size > 0) await channel.bulkDelete(userMsgs, true).catch(() => {});
}

async function timeoutMember(guild, userId, duration, reason) {
  try {
    const member = await guild.members.fetch(userId);
    if (!member) return null;
    if (member.roles.cache.some(r => config.bypassRoleIds.includes(r.id)) ||
        member.permissions.has(PermissionsBitField.Flags.Administrator)) return null;

    await member.timeout(duration, reason);
    return member;
  } catch (err) { console.error(err); return null; }
}

async function logPunishment(guild, member, reason, content, duration, channelName) {
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle("🚨 Punishment Applied")
    .setColor("Red")
    .addFields(
      { name: "👤 User", value: `${member.user.tag} (${member.id})` },
      { name: "📄 Reason", value: reason },
      { name: "⏱ Duration", value: `${duration / 3600000} hours` },
      { name: "💬 Message", value: content || "No content" },
      { name: "🏷 Channel", value: channelName || "Unknown" }
    )
    .setTimestamp();

  logChannel.send({
    content: reason === "Nuke Protection" ? config.adminRoleIds.map(r => `<@&${r}>`).join(" ") : null,
    embeds: [embed]
  });
}

function sendBoth(message, arabic, english) {
  return message.reply({ content: `${arabic}\n${english}` });
}

// -------------------------------------------------------------------------------------------

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (message.member.roles.cache.some(r => config.bypassRoleIds.includes(r.id))) return;

  const content = message.content.toLowerCase();

  if (config.badWords.some(word => content.includes(word))) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    const member = await timeoutMember(message.guild, message.author.id, config.punishDurations.other, "Bad language");
    if (member) await logPunishment(message.guild, member, "Bad language", message.content, config.punishDurations.other, message.channel.name);
    return;
  }

  if (message.mentions.everyone) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    const member = await timeoutMember(message.guild, message.author.id, config.punishDurations.other, "Mentioning @everyone");
    if (member) await logPunishment(message.guild, member, "Mentioning @everyone", message.content, config.punishDurations.other, message.channel.name);
    return;
  }

  if (/https?:\/\/|discord\.gg/i.test(content)) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    const member = await timeoutMember(message.guild, message.author.id, config.punishDurations.other, "Posting links");
    if (member) await logPunishment(message.guild, member, "Posting links", message.content, config.punishDurations.other, message.channel.name);
    return;
  }

  const emojiCount = (content.match(/<a?:.+?:\d+>|[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;
  if (emojiCount >= config.emojiSpamLimit) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    const member = await timeoutMember(message.guild, message.author.id, config.punishDurations.other, "Emoji spam");
    if (member) await logPunishment(message.guild, member, "Emoji spam", message.content, config.punishDurations.other, message.channel.name);
    return;
  }

  const now = Date.now();
  const timestamps = userMessages.get(message.author.id) || [];
  const updated = timestamps.filter(t => now - t < config.timeWindow);
  updated.push(now);
  userMessages.set(message.author.id, updated);

  if (updated.length >= config.spamLimit) {
    await message.delete().catch(() => {});
    await deleteUserMessages(message.channel, message.author.id);
    const member = await timeoutMember(message.guild, message.author.id, config.punishDurations.other, "Message spam");
    if (member) await logPunishment(message.guild, member, "Message spam", message.content, config.punishDurations.other, message.channel.name);
    return;
  }
});

// ================== Welcome & Invite System ==================



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
            invites.set(guildId, new Map(currentInvites.map(invite => [invite.code, invite.uses])));
            console.log(`Loaded ${currentInvites.size} invites for guild: ${guild.name}`);
        } catch (err) {
            console.log(`Failed to load invites for guild: ${guild.name}`);
            console.error(err);
        }
    }
});

client.on('inviteCreate', async invite => {
    const guildInvites = invites.get(invite.guild.id);
    if (guildInvites) guildInvites.set(invite.code, invite.uses);
});

client.on('inviteDelete', async invite => {
    const guildInvites = invites.get(invite.guild.id);
    if (guildInvites) guildInvites.delete(invite.code);
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
        const prevUses = (invites.get(member.guild.id)?.get(inv.code) || 0);
        return inv.uses > prevUses;
    });

    let inviterMention = 'Unknown';
    if (usedInvite && usedInvite.inviter) {
        inviterMention = `<@${usedInvite.inviter.id}>`;
        console.log(`Member joined with invite code ${usedInvite.code}, invited by ${inviterMention}`);
    } else {
        console.log(`Member joined, but no matching invite was found.`);
    }

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#05131f')
        .setTitle('Welcome to the Server!')
        .setDescription(`مرحباً ${member}، أهلاً بك في **${member.guild.name}**! نتمنى لك إقامة ممتعة.`)
        .addFields(
            { name: 'Username', value: member.user.tag, inline: true },
            { name: 'Invited By', value: inviterMention, inline: true },
            { name: 'Invite Used', value: usedInvite ? `||${usedInvite.code}||` : 'Direct Join', inline: true },
            { name: "You're Member", value: `${member.guild.memberCount}`, inline: true },
            { name: 'القوانين', value: '<#1402972324814389309>.', inline: true },
            { name: 'لتواصل مع الدعم', value: '<#1400602479728656434>.', inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    const bannerUrl = member.user.bannerURL?.({ dynamic: true, format: 'png', size: 1024 });
    if (bannerUrl) welcomeEmbed.setImage(bannerUrl);

    // Buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/jyVCzFtJr2')
            .setLabel('Chat')
            .setEmoji('💬'),
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/VB7F34rWTf')
            .setLabel('Games')
            .setEmoji('🧮'),
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/TdnweETu9r')
            .setLabel('Voice room')
            .setEmoji('🎤')
    );

    if (welcomeChannel) {
        welcomeChannel.send({ embeds: [welcomeEmbed], components: [row] }).catch(console.error);
    }

    // Update invite cache
    invites.set(member.guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));
});

// Corrected sendBoth function
function sendBoth(message, arabic, english) {
    return message.reply({ content: `${arabic}\n${english}` });
}


// -------------------------------------------------------------------------------------------

function hasPermission(member, command) {
  const roleIds = config.roleIds; // لازم تضيف roleIds في config.json
  const hasFull = member.roles.cache.has(roleIds.fullAccess);
  const hasMedium = member.roles.cache.has(roleIds.mediumAccess);

  const forbiddenForFull = ["باند", "كيك", "مانج-السيرفر"];
  const forbiddenForMedium = ["باند", "كيك", "امسح", "تايم-اوت", "مانج-السيرفر"];

  if (hasFull && !forbiddenForFull.includes(command)) return true;
  if (hasMedium && !forbiddenForMedium.includes(command)) return true;
  return false;
}

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  if (!hasPermission(message.member, command)) return message.reply("❌ ما عندك صلاحية استخدام هذا الأمر.");

  if (command === "ping") {
    return sendBoth(message, "🏓 البوت شغال تمام!", "🏓 Bot is up and running!");
  }

  if (command === "lock" || command === "اقفل") {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return sendBoth(message, "🔒 تم قفل القناة.", "🔒 Channel locked.");
  }

  if (command === "unlock" || command === "افتح") {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
    return sendBoth(message, "🔓 تم فتح القناة.", "🔓 Channel unlocked.");
  }

  if (command === "مسح") {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) {
      return sendBoth(message, "❌ رقم بين 1-100", "❌ Number between 1-100.");
    }
    await message.channel.bulkDelete(amount, true);
    return sendBoth(message, `✅ تم حذف ${amount} رسالة.`, `✅ Deleted ${amount} messages.`);
  }

  if (command === "kick" || command === "كيك") {
    const member = message.mentions.members.first();
    if (!member || !member.kickable) return sendBoth(message, "❌ لا يمكن طرده.", "❌ Cannot kick this user.");
    await member.kick();
    return sendBoth(message, `✅ تم طرد ${member.user.tag}.`, `✅ Kicked ${member.user.tag}.`);
  }

  if (command === "ban" || command === "باند") {
    const member = message.mentions.members.first();
    if (!member || !member.bannable) return sendBoth(message, "❌ لا يمكن حظره.", "❌ Cannot ban this user.");
    await member.ban();
    return sendBoth(message, `✅ تم حظر ${member.user.tag}.`, `✅ Banned ${member.user.tag}.`);
  }

  if (command === "unban" || command === "فك-باند") {
    const userId = args[0]?.replace(/[<@!>]/g, "");
    if (!userId) return sendBoth(message, "❌ اكتب ID العضو.", "❌ Provide user ID.");
    try {
      await message.guild.bans.remove(userId);
      return sendBoth(message, `✅ تم فك الحظر عن ${userId}.`, `✅ Unbanned ${userId}.`);
    } catch {
      return sendBoth(message, "❌ فشل في فك الحظر.", "❌ Failed to unban.");
    }
  }

  if (command === "timeout" || command === "تايم-اوت") {
    const member = message.mentions.members.first();
    const time = parseInt(args[1]);
    if (!member || isNaN(time)) return sendBoth(message, "❌ منشن العضو والمدة.", "❌ Mention user and duration.");
    await member.timeout(time, `Timeout by ${message.author.tag}`);
    return sendBoth(message, `✅ تم إعطاء ${member.user.tag} تايم أوت.`, `✅ Timeout given to ${member.user.tag}.`);
  }

  if (command === "قوانين") {
    if (args.length === 0) return message.reply("❌ اكتب محتوى القوانين بعد الأمر.");
    const content = args.join(" ");

    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle("📜 قوانين السيرفر")
      .setDescription(content)
      .setColor("Blue")
      .setThumbnail(message.guild.iconURL())
      .setImage(config.serverImageUrl)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_rules")
        .setLabel("✅ أوافق على القوانين")
        .setStyle(ButtonStyle.Success)
    );

    message.channel.send({ embeds: [embed], components: [row] });
  }

  if (command === "اعلان") {
  if (args.length === 0) return message.reply("❌ اكتب محتوى الإعلان بعد الأمر.");
  const content = args.join(" ");

  await message.delete().catch(() => {});

  // نجيب قناة الإعلانات من الكونفق
  const announcementChannel = message.guild.channels.cache.get(config.announcementChannelId);
  if (!announcementChannel) {
    return message.reply("❌ لم أجد قناة الإعلانات. تأكد من ID القناة في config.json");
  }

  const embed = new EmbedBuilder()
    .setTitle("📢 إعلان مجتمع C4")
    .setDescription(content)
    .setColor("Blue")
    .setThumbnail(message.guild.iconURL())
    .setImage(config.serverImageUrl)
    .setTimestamp();

  announcementChannel.send({ embeds: [embed] });
}


  if (command === "say") {
    const content = args.join(" ");
    if (!content) return message.reply("❌ اكتب الرسالة بعد الأمر.");

    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() || null })
      .setDescription(content)
      .setColor("#2F3136")
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "help" || command === "مساعدة") {
    await message.delete().catch(() => {});
    return message.channel.send(`🔧 **Available Commands | الأوامر المتاحة:**

\`&ping\`
\`&اقفل / &افتح\`
\`&امسح 10\`
\`&كيك @user\`
\`&باند @user\`
\`&فك-باند @userId\`
\`&تايم-اوت @user 60000\`
\`&قوانين <نص>\`
\`&اعلان <نص>\`
\`&say <نص>\`
    `);
  }
});

// تفاعل زر القوانين
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId === "accept_rules") {
    await interaction.reply({ content: "✅ لقد وافقت على القوانين بنجاح.", ephemeral: true });
    await interaction.member.roles.add(config.rulesRoleId).catch(console.error);
  }
});
// -------------------------------------------------------------------------------------------


// تفاعل زر القوانين
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "accept_rules") {
    await interaction.reply({ content: "✅ لقد وافقت على القوانين بنجاح.", ephemeral: true });
    await interaction.member.roles.add(config.rulesRoleId); // لازم تضيف rulesRoleId في config.json
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
function createLogEmbed(title, description, color = "Grey") {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

// باند
client.on("guildBanAdd", async (ban) => {
  const channel = client.channels.cache.get(config.logChannels.banLogChannelId);
  if (!channel) return;
  const fetchedLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const banLog = fetchedLogs.entries.find(entry => entry.target.id === ban.user.id);
  const executor = banLog?.executor;
  const reason = banLog?.reason || "لم يتم تحديد السبب";
  const embed = createLogEmbed("🚫 تم حظر عضو", `تم حظر **${ban.user.tag}** بواسطة ${executor?.tag || "مجهول"}\n**السبب:** ${reason}`, "Red");
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
    const embed = createLogEmbed(
      '❌ حذف روم',
      `**${channelDeleted.name}** تم حذفه بواسطة ${executor?.tag || 'مجهول'}\n**السبب:** ${reason}`,
      'DarkRed'
    );
    logChannel.send({ embeds: [embed] });
  }
}); // <- مهم إغلاق الحدث هنا


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
  const embed = createLogEmbed(
    '⚠️ حذف رتبة',
    `تم حذف رتبة **${role.name}** بواسطة ${executor?.tag || 'مجهول'}`,
    'Red'
  );
  const logChannel = client.channels.cache.get(logChannels.roleDeleteLogChannelId);
  if (logChannel) logChannel.send({ embeds: [embed] });
}); // <- أغلق الحدث هنا


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

// -------------------------------------------------------------------------------------------


let db;
(async () => {
  try {
    db = await open({
      filename: "./leveling.db",
      driver: sqlite3.Database
    });

    await db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, level INTEGER, xp INTEGER)");
    console.log("Database ready!");
  } catch (err) {
    console.error("Database error:", err);
  }
})();

function getRequiredXP(level) {
  return level * level * 100;
}

async function sendLevelUpMessage(userId, newLevel) {
  try {
    const channel = await client.channels.fetch(config.levelUpChannelId);
    const embed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("Level Up!")
      .setDescription(`<@${userId}> has reached level ${newLevel}! 🎉`)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    if (config.levelRoles[newLevel]) {
      const guild = channel.guild;
      const member = await guild.members.fetch(userId);
      const role = await guild.roles.fetch(config.levelRoles[newLevel]);
      if (role) await member.roles.add(role);
    }
  } catch (err) {
    console.error("Error in sendLevelUpMessage:", err);
  }
}

async function updateUserXP(userId, xpToAdd) {
  try {
    const row = await db.get("SELECT * FROM users WHERE id = ?", userId);

    if (row) {
      let newXP = row.xp + xpToAdd;
      let newLevel = row.level;
      let leveledUp = false;

      while (newXP >= getRequiredXP(newLevel)) {
        newXP -= getRequiredXP(newLevel);
        newLevel++;
        leveledUp = true;
      }

      if (leveledUp) await sendLevelUpMessage(userId, newLevel);
      await db.run("UPDATE users SET xp = ?, level = ? WHERE id = ?", newXP, newLevel, userId);
    } else {
      await db.run("INSERT INTO users (id, level, xp) VALUES (?, ?, ?)", userId, 1, xpToAdd);
    }
  } catch (err) {
    console.error("Error updating XP:", err);
  }
}

client.on("messageCreate", async message => {
  if (message.author.bot) return;

  if (!message.content.startsWith("!") && message.channel.id !== config.levelUpChannelId) {
    await updateUserXP(message.author.id, 10);
  }

  if (message.content === "!xp") {
    const users = await db.all("SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10");
    const embed = new EmbedBuilder().setColor("#0099ff").setTitle("XP Leaderboard").setDescription("Top users by XP").setTimestamp();
    users.forEach((user, index) => {
      embed.addFields({ name: `${index + 1}. ${user.id}`, value: `Level: ${user.level} | XP: ${user.xp}` });
    });
    message.channel.send({ embeds: [embed] });
  }

  if (message.content === "!rank") {
    const row = await db.get("SELECT * FROM users WHERE id = ?", message.author.id);
    if (row) {
      const users = await db.all("SELECT * FROM users ORDER BY level DESC, xp DESC");
      const rank = users.findIndex(u => u.id === message.author.id) + 1;
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle(`${message.author.username}'s Rank`)
        .addFields(
          { name: "Rank", value: `#${rank}`, inline: true },
          { name: "Level", value: `${row.level}`, inline: true },
          { name: "XP", value: `${row.xp}`, inline: true }
        );
      message.channel.send({ embeds: [embed] });
    } else {
      message.channel.send("You don't have any XP yet.");
    }
  }
});


// -------------------------------------------------------------------------------------------


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



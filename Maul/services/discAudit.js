const { EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const { resolveDbConfig } = require('./discNicknames');

const CONST_PATH = path.join(__dirname, '..', 'data', 'const.json');
const DISCORD_LOGO = process.env.MAUL_DISCORD_LOGO ||
  'https://cdn.discordapp.com/embed/avatars/5.png';

/**
 * Pull the shared Discord channel ID out of const.json.
 * If this fails, there is nowhere to post Discord events.
 */
function loadConstants() {
  try {
    return JSON.parse(fs.readFileSync(CONST_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to load const.json: ${error.message}`);
  }
}

/**
 * Retrieve the last cached nickname for a user, swallowing DB hiccups.
 */
async function fetchStoredUsername(pool, table, discordNum) {
  try {
    const [rows] = await pool.query(
      `SELECT username FROM \`${table}\` WHERE discordNum = ? LIMIT 1`,
      [discordNum]
    );
    return rows?.[0]?.username || null;
  } catch (error) {
    logger.warn(`[DiscAudit] Failed to fetch stored nickname for ${discordNum}.`, error);
    return null;
  }
}

/**
 * Compose the Discord join/leave embed, dressing it up with icons and timestamps.
 */
function buildMemberEmbed(member, type, storedUsername) {
  const isJoin = type === 'join';
  const color = isJoin ? 0x2ecc71 : 0xe74c3c;
  const username = member.displayName || member.user.globalName || member.user.username || 'Unknown user';
  const profileLink = `https://discord.com/users/${member.id}`;
  const discordTimestamp = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('DISCORD EVENT')
    .addFields(
      { name: 'Username', value: username, inline: false },
      { name: 'Profile', value: profileLink, inline: false },
      { name: 'When', value: `<t:${discordTimestamp}:F>`, inline: false }
    )
    .setFooter({ text: isJoin ? 'Member joined' : 'Member left' })
    .setThumbnail(DISCORD_LOGO);

  if (!isJoin && storedUsername) {
    embed.addFields({ name: 'Nickname', value: storedUsername, inline: false });
  }

  return embed;
}

/**
 * Register guild member join/leave listeners that fire embeds into the audit channel.
 */
async function startDiscAudit(client) {
  const constants = loadConstants();
  const channelId = constants.channelId;
  if (!channelId) throw new Error('channelId missing from const.json');

  logger.info('[DiscAudit] Starting Discord join/leave logger.');

  let channelPromise = null;

  async function ensureChannel() {
    if (!channelPromise) {
      channelPromise = client.channels.fetch(channelId)
        .then((ch) => {
          if (!ch?.isTextBased()) {
            throw new Error('Target channel is not text-based or accessible.');
          }
          return ch;
        })
        .catch((error) => {
          channelPromise = null;
          throw error;
        });
    }
    return channelPromise;
  }

  const cfg = resolveDbConfig();
  const pool = mysql.createPool({
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MAUL_NICK_DB_POOL || 2),
    queueLimit: 0
  });

  async function handleJoin(member) {
    try {
      const channel = await ensureChannel();
      const embed = buildMemberEmbed(member, 'join', null);
      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error(`[DiscAudit] Failed to log join for ${member.id}.`, error);
    }
  }

  async function handleLeave(member) {
    try {
      const channel = await ensureChannel();
      const storedUsername = await fetchStoredUsername(pool, cfg.table, String(member.id));
      const embed = buildMemberEmbed(member, 'leave', storedUsername);
      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error(`[DiscAudit] Failed to log leave for ${member.id}.`, error);
    }
  }

  const joinListener = (member) => handleJoin(member);
  const leaveListener = (member) => handleLeave(member);

  client.on('guildMemberAdd', joinListener);
  client.on('guildMemberRemove', leaveListener);

  return {
    stop: async () => {
      client.removeListener('guildMemberAdd', joinListener);
      client.removeListener('guildMemberRemove', leaveListener);
      await pool.end();
      logger.info('[DiscAudit] Stopped Discord join/leave logger.');
    }
  };
}

module.exports = { startDiscAudit };


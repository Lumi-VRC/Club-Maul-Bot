const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

const DEFAULT_DB = 'maulData';
const DEFAULT_TABLE = 'maulAuditLogs';
const SCAN_INTERVAL_MS = Number(process.env.MAUL_WRITER_INTERVAL_MS || 1_000);
const CONST_PATH = path.join(__dirname, '..', 'data', 'const.json');

/**
 * Grabs DB credentials, letting env vars override defaults.
 * Obviously, you should use env vars, but I'm lazy, and this is a simple bot.
 */
function resolveDbConfig() {
  return {
    host: process.env.MAUL_DB_HOST || 'localhost',
    user: process.env.MAUL_DB_USER || 'maul',
    password: process.env.MAUL_DB_PASSWORD || 'Sup3rStrongPassword123#',
    port: Number(process.env.MAUL_DB_PORT || 3306),
    database: process.env.MAUL_DB_NAME || DEFAULT_DB,
    table: process.env.MAUL_DB_TABLE || DEFAULT_TABLE
  };
}

/**
 * Load group/channel IDs shared across services.
 */
function loadConstants() {
  try {
    return JSON.parse(fs.readFileSync(CONST_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to load const.json: ${error.message}`);
  }
}

const SUPPORTED_EVENT_TYPES = new Set([
  'group.member.leave',
  'group.request.create'
]);

/**
 * Fetch the oldest audit log row we haven't posted yet, locking it for processing.
 */
async function fetchOldestUnposted(connection, table) {
  const sql = `
    SELECT id, eventId, eventType, targetId, targetDisplayName, actorId, actorDisplayName, description, createdAt
    FROM \`${table}\`
    WHERE posted = 0
    ORDER BY createdAt ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  const [rows] = await connection.query(sql);
  return rows?.[0] || null;
}

/**
 * Flip the posted flag for a processed audit entry.
 */
async function markPosted(connection, table, id) {
  await connection.query(
    `UPDATE \`${table}\` SET posted = 1, processedAt = NOW() WHERE id = ?`,
    [id]
  );
}

/**
 * Derive a human-friendly display name from the VRChat audit payload.
 */
function resolveDisplayName(record) {
  if (record.targetDisplayName) return record.targetDisplayName;
  if (record.actorDisplayName) return record.actorDisplayName;
  const desc = record.description || '';
  const match = desc.match(/^User\s+(.+?)\s+has\s+(joined|left)/i);
  if (match) return match[1];
  return 'Unknown user';
}

/**
 * Pick the best candidate for building a VRChat profile link.
 */
function resolveProfileId(record) {
  return record.targetId || record.actorId || null;
}

/**
 * Translate a VRChat audit row into a Discord embed, using the bot's avatar for flair.
 */
function buildEventEmbed(record, client) {
  const isLeave = record.eventType === 'group.member.leave';
  const isRequest = record.eventType === 'group.request.create';

  const color = isRequest ? 0x3498db : 0xe74c3c;
  const username = resolveDisplayName(record);
  const profileId = resolveProfileId(record);
  const profileLink = profileId ? `https://vrchat.com/home/user/${profileId}` : 'https://vrchat.com/home';
  const timestampMs = new Date(record.createdAt).getTime();
  const discordTimestamp = Math.floor(timestampMs / 1000);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('VRCHAT EVENT')
    .addFields(
      { name: 'Username', value: username, inline: false },
      { name: 'Profile', value: profileLink, inline: false },
      { name: 'When', value: `<t:${discordTimestamp}:F>`, inline: false }
    )
    .setFooter({ text: isRequest ? 'Join request submitted' : 'Member left' });

  if (client?.user) {
    const avatar = client.user.displayAvatarURL({ size: 256 });
    if (avatar) embed.setThumbnail(avatar);
  }

  return embed;
}

/**
 * Polls the audit table and sends Discord embeds at a gentle pace. (1s between messages per channel)
 */
async function startVrcAuditWriter(client) {
  const cfg = resolveDbConfig();
  const constants = loadConstants();
  const channelId = constants.channelId;
  if (!channelId) throw new Error('channelId missing from const.json');

  logger.info('[VRCAuditWriter] Starting.');

  const pool = mysql.createPool({
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MAUL_WRITER_DB_POOL || 3),
    queueLimit: 0
  });

  let timer = null;
  let isProcessing = false;
  let stopped = false;

  async function processNext() {
    if (isProcessing) return;
    isProcessing = true;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const record = await fetchOldestUnposted(connection, cfg.table);
      if (!record) {
        await connection.commit();
        return;
      }

      const { id, eventType } = record;
      if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
        await markPosted(connection, cfg.table, id);
        await connection.commit();
        logger.debug(`[VRCAuditWriter] Marked non-member event ${record.eventId} as posted.`);
        return;
      }

      await connection.commit();

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) {
          throw new Error('Target channel is not text-based or accessible.');
        }

        const embed = buildEventEmbed(record, client);
        await channel.send({ content: null, embeds: [embed] });

        await markPosted(pool, cfg.table, id);
        logger.info(`[VRCAuditWriter] Posted ${eventType} event ${record.eventId}.`);
      } catch (error) {
        logger.error(`[VRCAuditWriter] Failed to post event ${record.eventId}.`, error);
      }
    } catch (error) {
      await connection.rollback();
      logger.error('[VRCAuditWriter] Error processing audit entry.', error);
    } finally {
      connection.release();
      isProcessing = false;
    }
  }

  async function tick() {
    if (stopped) return;
    await processNext().catch((error) => logger.error('[VRCAuditWriter] Unhandled loop error.', error));
    if (!stopped) {
      timer = setTimeout(() => {
        tick().catch((error) => logger.error('[VRCAuditWriter] Unhandled loop error.', error));
      }, SCAN_INTERVAL_MS);
    }
  }

  timer = setTimeout(() => {
    tick().catch((error) => logger.error('[VRCAuditWriter] Unhandled loop error.', error));
  }, SCAN_INTERVAL_MS);

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await pool.end();
      logger.info('[VRCAuditWriter] Stopped.');
    }
  };
}

module.exports = { startVrcAuditWriter };


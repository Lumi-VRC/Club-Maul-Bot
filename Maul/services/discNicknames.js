const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const DEFAULT_DB = 'maulData';
const MEMBERS_TABLE = 'maulDiscMem';
const SCAN_INTERVAL_MS = Number(process.env.MAUL_NICK_SCAN_MS || 60_000);
const GUILD_IDS = (process.env.MAUL_GUILD_IDS || '').split(',').map((g) => g.trim()).filter(Boolean);

/**
 * Shared helper so other services can reuse the DB credentials.
 */
function resolveDbConfig() {
  return {
    host: process.env.MAUL_DB_HOST || 'localhost',
    user: process.env.MAUL_DB_USER || 'maul',
    password: process.env.MAUL_DB_PASSWORD || 'Sup3rStrongPassword123#',
    port: Number(process.env.MAUL_DB_PORT || 3306),
    database: process.env.MAUL_DB_NAME || DEFAULT_DB,
    table: MEMBERS_TABLE
  };
}

/**
 * Create the nickname table if we haven't done so already.
 */
async function ensureMembersTable(pool, table) {
  await pool.query(`CREATE TABLE IF NOT EXISTS \`${table}\` (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    discordNum VARCHAR(32) NOT NULL UNIQUE,
    discordId VARCHAR(64) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
}

/**
 * Persist (or refresh) a single member's nickname row.
 */
async function upsertMember(pool, table, member) {
  const user = member.user || {};
  const discordNum = String(user.id);
  const discordId = user.tag || `${user.username || 'unknown'}#${user.discriminator || '0000'}`;
  const username = member.displayName || user.globalName || user.username || 'Unknown user';

  await pool.query(
    `INSERT INTO \`${table}\` (discordNum, discordId, username)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE username = VALUES(username), updatedAt = CURRENT_TIMESTAMP`,
    [discordNum, discordId, username]
  );
}

/**
 * Fetch the entire member list for a guild and upsert everyone.
 * discord.js handles pagination internally as long as the intent is enabled.
 */
async function scanGuildMembers(client, guildId, pool, table) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      logger.warn(`[DiscNicknames] Unable to fetch guild ${guildId}.`);
      return;
    }

    const iterator = guild.members.fetch({ withPresences: false, force: true });
    const fetched = await iterator;

    for (const [, member] of fetched) {
      try {
        await upsertMember(pool, table, member);
      } catch (error) {
        logger.warn(`[DiscNicknames] Failed to upsert member ${member.user?.id}`, error);
      }
    }

    logger.info(`[DiscNicknames] Synced ${fetched.size} members for guild ${guildId}.`);
  } catch (error) {
    logger.error(`[DiscNicknames] Failed to sync guild ${guildId}.`, error);
  }
}

/**
 * Kick off the nickname synchronizer loop.
 */
async function startDiscNicknames(client) {
  const cfg = resolveDbConfig();
  const guildIds = GUILD_IDS.length > 0 ? GUILD_IDS : client.guilds.cache.map((g) => g.id);
  if (guildIds.length === 0) {
    logger.warn('[DiscNicknames] No guilds available to scan.');
    return { stop: async () => {} };
  }

  logger.info('[DiscNicknames] Starting nickname synchronizer.');

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

  await ensureMembersTable(pool, cfg.table);

  let timer = null;
  let stopped = false;

  async function performScan() {
    for (const guildId of guildIds) {
      if (stopped) break;
      await scanGuildMembers(client, guildId, pool, cfg.table);
    }
  }

  async function loop() {
    if (stopped) return;
    await performScan().catch((error) => logger.error('[DiscNicknames] Scan failed.', error));
    if (!stopped) {
      timer = setTimeout(() => {
        loop().catch((error) => logger.error('[DiscNicknames] Scan loop error.', error));
      }, SCAN_INTERVAL_MS);
    }
  }

  timer = setTimeout(() => {
    loop().catch((error) => logger.error('[DiscNicknames] Scan loop error.', error));
  }, 5_000);

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await pool.end();
      logger.info('[DiscNicknames] Stopped nickname synchronizer.');
    }
  };
}

module.exports = { startDiscNicknames, resolveDbConfig };


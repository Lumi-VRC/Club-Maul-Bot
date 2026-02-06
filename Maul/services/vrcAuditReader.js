const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const mysql = require('mysql2/promise');
const vrchat = require('vrchat');
const twofactor = require('node-2fa');
const logger = require('../utils/logger');

const DEFAULT_DB = 'maulData';
const DEFAULT_TABLE = 'maulAuditLogs';
const USER_AGENT = 'MaulBot/AuditReader';
const POLL_INTERVAL_MS = Number(process.env.MAUL_AUDIT_POLL_INTERVAL_MS || 60_000);
const AUDIT_PAGE_SIZE = Number(process.env.MAUL_AUDIT_PAGE_SIZE || 50);
const AUTH_RETRY_COOLDOWN_MS = Number(process.env.MAUL_AUTH_RETRY_COOLDOWN_MS || 3_600_000); // 1 hour
const AUTH_REFRESH_MS = Number(process.env.MAUL_AUTH_REFRESH_MS || 10_800_000); // 3 hours

const CONST_PATH = path.join(__dirname, '..', 'data', 'const.json');
const AUTH_PATH = path.join(__dirname, '..', 'data', 'vrcLogin.json');

/**
 * Gather MySQL configuration, letting env vars override defaults.
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
 * Convenience helper for pulling JSON off disk.
 */
function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Write JSON back to disk without taking down the process if it fails.
 */
function safeWriteJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.warn(`[VRCAuditReader] Failed to persist ${path.basename(filePath)}.`, error);
  }
}

/**
 * Create the audit database/table when needed.
 */
async function ensureSchema(dbConfig) {
  const server = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
    multipleStatements: true
  });

  try {
    await server.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await server.query(`CREATE TABLE IF NOT EXISTS \`${dbConfig.database}\`.\`${dbConfig.table}\` (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      eventId VARCHAR(255) NOT NULL,
      groupId VARCHAR(255) NOT NULL,
      eventType VARCHAR(255) NOT NULL,
      eventCategory VARCHAR(32) NULL,
      description TEXT NOT NULL,
      notes TEXT NULL,
      actorId VARCHAR(255) NULL,
      actorDisplayName VARCHAR(255) NULL,
      targetId VARCHAR(255) NULL,
      targetDisplayName VARCHAR(255) NULL,
      payload JSON NULL,
      createdAt DATETIME NOT NULL,
      posted TINYINT(1) NOT NULL DEFAULT 0,
      msgId VARCHAR(32) NULL,
      insertedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processedAt TIMESTAMP NULL DEFAULT NULL,
      source VARCHAR(32) NOT NULL DEFAULT 'vrcAuditReader',
      UNIQUE KEY uniq_event (eventId),
      KEY idx_group_created (groupId, createdAt),
      KEY idx_actor (actorId),
      KEY idx_target (targetId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    // Ensure columns are wide enough even if table existed previously
    logger.info('[VRCAuditReader] Schema ensured.');
  } finally {
    await server.end();
  }
}

/**
 * Boil the VRChat eventType into a friendlier bucket. They keep fucking with names so this is helpful futureproofing.
 */
function deriveCategory(eventType) {
  const value = (eventType || '').toLowerCase();
  if (value.includes('unban')) return 'unban';
  if (value.includes('ban')) return 'ban';
  if (value.includes('kick')) return 'kick';
  if (value.includes('warn')) return 'warn';
  if (value.includes('note')) return 'note';
  if (value.includes('moderation')) return 'moderation';
  return 'other';
}

/**
 * Normalize timestamps into MySQL DATETIME strings.
 */
function toMySqlDate(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Pull an auth cookie out of a VRChat SDK response.
 */
function extractAuthCookie(response) {
  const cookies = response?.headers?.['set-cookie'];
  if (!Array.isArray(cookies)) return null;
  const authCookie = cookies.find((cookie) => typeof cookie === 'string' && cookie.startsWith('auth='));
  return authCookie ? authCookie.split(';')[0].split('=')[1] : null;
}

/**
 * Log into VRChat (with 2FA support) and hand back a fresh auth cookie.
 */
async function performLogin(authConfig) {
  const configuration = new vrchat.Configuration({
    username: encodeURIComponent(authConfig.VRChat.email),
    password: encodeURIComponent(authConfig.VRChat.pass),
    baseOptions: { headers: { 'User-Agent': USER_AGENT } }
  });

  const AuthenticationApi = new vrchat.AuthenticationApi(configuration);

  const initial = await AuthenticationApi.getCurrentUser();
  let cookie = extractAuthCookie(initial);

  if (!initial?.data?.displayName) {
    if (!authConfig?.VRChat?.twofa) {
      throw new Error('2FA secret missing for VRChat login.');
    }
    const token = twofactor.generateToken(authConfig.VRChat.twofa);
    if (!token?.token) throw new Error('Failed to generate OTP token for VRChat login.');
    try {
      await AuthenticationApi.verify2FA({ code: token.token });
    } catch (error) {
      if (error?.response?.status === 429 && authConfig?.VRChat?.authCookie) {
        logger.warn('[VRCAuditReader] 2FA verification was rate limited; reusing cached auth cookie.');
        return authConfig.VRChat.authCookie;
      }
      throw error;
    }
    const retry = await AuthenticationApi.getCurrentUser();
    cookie = extractAuthCookie(retry) || cookie;
  }

  if (!cookie) {
    cookie = authConfig?.VRChat?.authCookie || null;
  }

  if (!cookie) {
    throw new Error('Unable to obtain VRChat auth cookie.');
  }

  authConfig.VRChat.authCookie = cookie;
  safeWriteJson(AUTH_PATH, authConfig);

  logger.info(`[VRCAuditReader] Authenticated to VRChat as ${initial?.data?.displayName || authConfig.VRChat.email}.`);
  return cookie;
}

/**
 * Hit the VRChat audit endpoint for the given group using our auth cookie.
 */
async function fetchAuditLogs(groupId, authCookie) {
  const response = await axios.get(`https://api.vrchat.cloud/api/1/groups/${groupId}/auditLogs`, {
    params: { offset: 0, count: AUDIT_PAGE_SIZE },
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: `auth=${authCookie}`
    },
    timeout: 30_000
  });
  return response?.data?.results || [];
}

/**
 * Translate a VRChat raw audit entry into a DB row array for bulk insert.
 */
function mapLogToRow(log, groupId) {
  return [
    log.id,
    groupId,
    log.eventType || 'unknown',
    deriveCategory(log.eventType),
    log.description || '',
    log.notes || null,
    log.actorId || null,
    log.actorDisplayName || null,
    log.targetId || null,
    log.targetDisplayName || null,
    JSON.stringify(log ?? {}),
    toMySqlDate(log.created_at || log.createdAt || log.created),
    0,
    null
  ];
}

/**
 * Bulk insert (or update) audit rows into MySQL.
 */
async function insertAuditRows(pool, table, rows) {
  if (!rows.length) return 0;
  const sql = `
    INSERT INTO \`${table}\`
      (eventId, groupId, eventType, eventCategory, description, notes, actorId, actorDisplayName, targetId, targetDisplayName, payload, createdAt, posted, msgId)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      eventType = VALUES(eventType),
      eventCategory = VALUES(eventCategory),
      description = VALUES(description),
      notes = VALUES(notes),
      actorId = VALUES(actorId),
      actorDisplayName = VALUES(actorDisplayName),
      targetId = VALUES(targetId),
      targetDisplayName = VALUES(targetDisplayName),
      payload = VALUES(payload),
      createdAt = VALUES(createdAt),
      posted = VALUES(posted),
      msgId = VALUES(msgId);
  `;
  const [result] = await pool.query(sql, [rows]);
  return result?.affectedRows || 0;
}

/**
 * Filter out audit IDs we already know about so we don't spam duplicates.
 */
async function pruneExisting(pool, table, groupId, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT eventId FROM \`${table}\` WHERE groupId = ? AND eventId IN (${placeholders})`,
    [groupId, ...ids]
  );
  const existing = new Set(rows.map((row) => row.eventId));
  return ids.filter((id) => !existing.has(id));
}

/**
 * Orchestrate login, polling loop, and graceful teardown for audit ingestion. Elegance!
 */
async function startVrcAuditReader() {
  const constants = loadJson(CONST_PATH);
  const authConfig = loadJson(AUTH_PATH);
  const dbConfig = resolveDbConfig();

  logger.info('[VRCAuditReader] Initializing.');
  await ensureSchema(dbConfig);

  const pool = mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MAUL_DB_POOL_SIZE || 5),
    queueLimit: 0
  });

  const targetGroupId = constants.groupId;
  if (!targetGroupId) throw new Error('groupId missing in const.json');

  let authCookie = null;
  let timer = null;
  let isPolling = false;
  let lastAuthFailureTime = null;
  let refreshTimer = null;

  async function ensureAuth(force = false) {
    // If we have a valid cookie and not forcing, use it
    if (authCookie && !force) return authCookie;
    
    // Check if we're in cooldown period after a failed authentication
    if (lastAuthFailureTime !== null) {
      const timeSinceFailure = Date.now() - lastAuthFailureTime;
      if (timeSinceFailure < AUTH_RETRY_COOLDOWN_MS) {
        const remainingMinutes = Math.ceil((AUTH_RETRY_COOLDOWN_MS - timeSinceFailure) / 60_000);
        logger.debug(`[VRCAuditReader] Authentication retry cooldown active. Retrying in ${remainingMinutes} minute(s).`);
        throw new Error(`Authentication retry cooldown: ${remainingMinutes} minute(s) remaining`);
      }
      // Cooldown expired, reset failure time
      lastAuthFailureTime = null;
    }
    
    if (force) {
      authCookie = null;
      if (authConfig?.VRChat) {
        authConfig.VRChat.authCookie = null;
        safeWriteJson(AUTH_PATH, authConfig);
      }
    }

    authCookie = await performLogin(authConfig);
    return authCookie;
  }

  async function pollLogs() {
    if (isPolling) {
      logger.debug('[VRCAuditReader] Previous poll still running, skipping.');
      return;
    }
    isPolling = true;

    try {
      await ensureAuth();
      const logs = await fetchAuditLogs(targetGroupId, authCookie);
      if (!Array.isArray(logs) || logs.length === 0) {
        logger.debug('[VRCAuditReader] No audit entries returned this cycle.');
        return;
      }

      const eventIds = logs.map((log) => log.id);
      const missingIds = await pruneExisting(pool, dbConfig.table, targetGroupId, eventIds);
      if (!missingIds.length) {
        logger.debug('[VRCAuditReader] All fetched logs already stored.');
        return;
      }

      const rows = logs
        .filter((log) => missingIds.includes(log.id))
        .map((log) => mapLogToRow(log, targetGroupId));

      if (!rows.length) return;

      const inserted = await insertAuditRows(pool, dbConfig.table, rows);
      logger.info(`[VRCAuditReader] Inserted ${rows.length} new audit entries (affected rows: ${inserted}).`);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        logger.warn('[VRCAuditReader] Authentication expired. Will retry after cooldown period.');
        authCookie = null;
        lastAuthFailureTime = Date.now();
      } else if (status === 429) {
        logger.warn('[VRCAuditReader] Rate limited by VRChat API. Will retry on next cycle.');
      } else {
        logger.error('[VRCAuditReader] Polling error.', error);
      }
    } finally {
      isPolling = false;
    }
  }

  try {
    await ensureAuth();
    await pollLogs();
  } catch (error) {
    logger.error('[VRCAuditReader] Startup failed during first poll.', error);
    await pool.end();
    throw error;
  }

  timer = setInterval(() => {
    pollLogs().catch((error) => logger.error('[VRCAuditReader] Unhandled polling exception.', error));
  }, POLL_INTERVAL_MS);

  logger.info('[VRCAuditReader] Polling scheduled.');

  if (AUTH_REFRESH_MS > 0) {
    refreshTimer = setInterval(() => {
      ensureAuth(true)
        .then(() => logger.info('[VRCAuditReader] Periodic auth refresh complete.'))
        .catch((error) => logger.warn('[VRCAuditReader] Periodic auth refresh failed.', error));
    }, AUTH_REFRESH_MS);
    logger.info(`[VRCAuditReader] Auth refresh scheduled every ${Math.round(AUTH_REFRESH_MS / 3_600_000)} hour(s).`);
  }

  return {
    stop: async () => {
      if (timer) clearInterval(timer);
      if (refreshTimer) clearInterval(refreshTimer);
      await pool.end();
      logger.info('[VRCAuditReader] Stopped.');
    }
  };
}

module.exports = { startVrcAuditReader };


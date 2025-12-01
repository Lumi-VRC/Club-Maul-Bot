const { Events } = require('discord.js');
const client = require('./core/client');
const { token, clientId } = require('./config');
const loadEvents = require('./core/eventLoader');
/**
 * Maul bot bootstrap: wire together core services and lifetime hooks.
 */
const { startStatusService } = require('./services/statusRotator');
const { startVrcAuditReader } = require('./services/vrcAuditReader');
const { startVrcAuditWriter } = require('./services/vrcAuditWriter');
const { startDiscNicknames } = require('./services/discNicknames');
const { startDiscAudit } = require('./services/discAudit');
const logger = require('./utils/logger');

logger.info('[Bootstrap] Starting Maul bot bootstrap sequence.');
logger.info(`[Bootstrap] Using clientId ${clientId}`);

loadEvents(client);

let stopStatus = null;
let stopAuditReader = null;
let stopAuditWriter = null;
let stopDiscNicknames = null;
let stopDiscAudit = null;

/**
 * When Discord says we're ready, light up the microservices.
 */
client.once(Events.ClientReady, (readyClient) => {
  logger.info(`[Bootstrap] Logged in as ${readyClient.user.tag}`);
  try {
    const statusService = startStatusService(readyClient);
    stopStatus = () => statusService?.stop?.();
  } catch (error) {
    logger.warn(`[Bootstrap] Failed to start status service: ${error.message}`);
  }

  startVrcAuditReader()
    .then((service) => {
      stopAuditReader = () => service?.stop?.();
      logger.info('[Bootstrap] VRCAuditReader initialized.');
    })
    .catch((error) => logger.error('[Bootstrap] VRCAuditReader initialization failed.', error));

  startVrcAuditWriter(readyClient)
    .then((service) => {
      stopAuditWriter = () => service?.stop?.();
      logger.info('[Bootstrap] VRCAuditWriter initialized.');
    })
    .catch((error) => logger.error('[Bootstrap] VRCAuditWriter initialization failed.', error));

  startDiscNicknames(readyClient)
    .then((service) => {
      stopDiscNicknames = () => service?.stop?.();
      logger.info('[Bootstrap] DiscNicknames initialized.');
    })
    .catch((error) => logger.error('[Bootstrap] DiscNicknames initialization failed.', error));

  startDiscAudit(readyClient)
    .then((service) => {
      stopDiscAudit = () => service?.stop?.();
      logger.info('[Bootstrap] DiscAudit initialized.');
    })
    .catch((error) => logger.error('[Bootstrap] DiscAudit initialization failed.', error));
});

client.on('error', (error) => logger.error('[Client] Websocket error encountered.', error));
client.on('shardError', (error) => logger.error('[Client] Shard error encountered.', error));

const gracefulShutdown = (signal) => {
  /**
   * Try to unwind gracefully when the process gets poked.
   */
  logger.warn(`[Bootstrap] Received ${signal}. Shutting down gracefully...`);
  if (stopStatus) {
    try { stopStatus(); } catch (error) { logger.warn(`[Bootstrap] Error stopping status service: ${error.message}`); }
  }
  if (stopAuditReader) {
    Promise.resolve()
      .then(() => stopAuditReader())
      .catch((error) => logger.warn('[Bootstrap] Error stopping audit reader.', error));
  }
  if (stopAuditWriter) {
    Promise.resolve()
      .then(() => stopAuditWriter())
      .catch((error) => logger.warn('[Bootstrap] Error stopping audit writer.', error));
  }
  if (stopDiscNicknames) {
    Promise.resolve()
      .then(() => stopDiscNicknames())
      .catch((error) => logger.warn('[Bootstrap] Error stopping nickname sync.', error));
  }
  if (stopDiscAudit) {
    Promise.resolve()
      .then(() => stopDiscAudit())
      .catch((error) => logger.warn('[Bootstrap] Error stopping Discord audit.', error));
  }
  client.destroy();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

client.login(token).catch((error) => {
  logger.error('[Bootstrap] Failed to login. Check token and network configuration.', error);
  process.exit(1);
});


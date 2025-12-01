const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');

const STATUSES = [
  { name: 'is watching for new victims!', type: ActivityType.Watching },
  { name: '- microservices spin up -', type: ActivityType.Listening }
];

function startStatusService(client, rotateMs = 60_000) {
  if (!client.user) {
    throw new Error('Client user not ready. Start status service after ready event.');
  }

  logger.info('[StatusService] Booting status rotator.');

  let index = 0;
  const applyPresence = () => {
    const payload = STATUSES[index % STATUSES.length];
    index += 1;
    try {
      client.user.setPresence({ activities: [{ name: payload.name, type: payload.type }], status: 'online' });
    } catch (err) {
      logger.warn(`[StatusService] Failed to update presence: ${err.message}`);
    }
  };

  applyPresence();
  const timer = setInterval(applyPresence, rotateMs);

  return {
    name: 'status-rotator',
    stop() {
      clearInterval(timer);
      logger.info('[StatusService] Stopped status rotator.');
    }
  };
}

module.exports = { startStatusService };


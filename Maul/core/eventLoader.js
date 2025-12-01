const fs = require('node:fs');
const path = require('node:path');
const logger = require('../utils/logger');

function registerEvent(client, eventModule) {
  if (!eventModule?.name || typeof eventModule.execute !== 'function') {
    logger.warn(`[EventLoader] Skipping invalid event module.`);
    return;
  }
  if (eventModule.once) {
    client.once(eventModule.name, (...args) => eventModule.execute(...args));
  } else {
    client.on(eventModule.name, (...args) => eventModule.execute(...args));
  }
  logger.info(`[EventLoader] Registered event ${eventModule.name}`);
}

function loadEvents(client) {
  const eventsDir = path.join(__dirname, '..', 'events');
  const files = fs.readdirSync(eventsDir).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const eventModule = require(path.join(eventsDir, file));
    if (Array.isArray(eventModule)) {
      eventModule.forEach((mod) => registerEvent(client, mod));
    } else {
      registerEvent(client, eventModule);
    }
  }
}

module.exports = loadEvents;


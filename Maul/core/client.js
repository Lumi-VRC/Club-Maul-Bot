const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

/**
 * Spin up a shared Discord client with the intents we need for
 * commands, member sync, and message handling.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/**
 * Slot to hold slash command modules once we load them at startup.
 */
client.commands = new Collection();

module.exports = client;


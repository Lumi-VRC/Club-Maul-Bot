const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`[Commands] Received unknown command /${interaction.commandName}`);
      await interaction.reply({ content: 'Command not available.', ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`[Commands] Failed to execute /${interaction.commandName}`, error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('An error occurred while executing this command.');
      } else {
        await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
      }
    }
  }
};


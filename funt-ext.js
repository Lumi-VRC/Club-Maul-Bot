const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require("discord.js");
const Sequelize = require("sequelize");
const {
  GetGroupAuditLog,
  GetGroupInfo,
  GetGroupInstances,
  BanGroupUser,
  UnbanGroupUser,
  GetUsers,
  GetUsersGroups,
  GetBlacklistUsersGroups,
  fetchUserGroups,
  getWorldInfo,
  getFileInfo
} = require("../utils/vrchat");

const {
  GroupUserEvent,
  GroupEvents
} = require("../events/interactionModal.js");
const client = require("../index");

const { databases } = require("../database/database.js");

const { isUserModerator } = require("../events/interactionModal.js");

const config = require("../config/settings.json");

// Helper to set up tables
// Check audit logs, log new events, and post updates
async function checkForUpdates() {
  for (let i = 0; i < config.groups.length; i++) {
    if (true) {
      const guild = await client.guilds.fetch(config.groups[i].discord.ServerID);
      const group = (await GetGroupInfo(config.groups[i].vrc.groupid)).data;

      if (config.groups[i].discord.memberCountChannel) {
        memberCountCh = await client.channels.fetch(config.groups[i].discord.memberCountChannel);
        memberCountCh.setName(`Members: ${group.memberCount}`);
      }
      
      if (["670461006186545173", "1314748935780171798"].includes(config.groups[i].discord.ServerID)) {
        const groupInstances = (await GetGroupInstances(config.groups[i].vrc.groupid)).data;

        const instances = await databases[i].GroupInstances.findAll();

        for (const instance of groupInstances) {
          const instanceDB = await databases[i].GroupInstances.findOne({where: { id: instance.instanceId.split('~')[0] }});

          var channel;

          if (instanceDB) {
            try {
              channel = await client.channels.fetch(instanceDB.getDataValue("channelId"))
            } catch {
              console.log("Failed to update channel");
              await instanceDB.destroy();
              continue;
            }

            if (channel === undefined) {
              console.log("Failed to update channel");
              await instanceDB.destroy();
              continue;
            }

            channel.setName(`${instance.world.name}: ${instance.memberCount}`); // this will only get users that are group members

            // channel.setName(`${instance.world.name}: ${instance.world.occupants}`); this is to get all users in the world (api is not returning world.occupants from group instances)
      
            await databases[i].GroupInstances.update({active: true}, {where: {channelId: channel.id}});

          } else {
            const channel = await guild.channels.create({
              name: `${instance.world.name}: ${instance.memberCount}`,
              type: ChannelType.GuildVoice,
            });
            try {channel.setParent(config.groups[i].discord.instancePopulationCategory)}
            catch {
              guild.channels.delete(channel.id);
              console.log("Error creating channel");
              continue;
            };

            await databases[i].GroupInstances.create({ id: instance.instanceId.split('~')[0], channelId: channel.id, active: true});
          }
        }

        for (const instance of instances) {
          const instanceDB = await databases[i].GroupInstances.findOne({where: { id: instance.dataValues.id }});
          if (instanceDB.active == false) {
            await instanceDB.destroy();
            await guild.channels.delete(instanceDB.channelId);
          }
        }
        await databases[i].GroupInstances.update({active: false}, {where: {}});
      }

      const response = await GetGroupAuditLog(config.groups[i].vrc.groupid);

      if (response.status !== 200) {
        console.log("Error: cant get group audit logs!");
        console.log(`Group name: ${config.groups[i].name}`);
        console.log(`Group ID: ${config.groups[i].vrc.groupid}`);
        console.log(response);
        continue;
      }
    
      // Process each event
      for (const event of response.data.results.slice(0, 100).reverse()) {
        var exists = undefined;
        // Skip event if already logged
        if (config.groups[i].discord.ServerID == config.TestingServerID) {
          exists = await databases[i].GroupEvents.findOne({
            where: { id: event.id }
          });
        } else {
          exists = await databases[i].GroupEvents.findOne({
            where: { eventId: event.id }
          });
        }
        if (exists) continue;

        // Post formatted embed based on event type
        if (["group.member.join"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.JOINMEMBER
          );
        } else if (["group.member.leave"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.LEAVEMEMBER
          );
        } else if (["group.member.remove"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.REMOVEMEMBER
          );
        } else if (["group.user.unban"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.UNBANMEMBER
          );
        } else if (["group.instance.kick"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.KICKMEMBER
          );
        } else if (["group.instance.warn"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.WARNMEMBER
          );
        } else if (["group.instance.create"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.WORLDCREATEMEMBER
          );
        } else if (["group.instance.close"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.WORLDCLOSEMEMBER
          );
        } else if (["group.user.ban"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "ban",
            ButtonStyle.Danger,
            config.groups[i].discord.LoggerTextChannel.BANMEMBER
          );
        } else if (["group.post.create"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Success,
            config.groups[i].discord.LoggerTextChannel.POST
          );
        } else if (["group.post.delete"].includes(event.eventType)) {
          await postEventEmbed(
            event,
            databases[i].GroupUserEvent,
            "unban",
            ButtonStyle.Danger,
            config.groups[i].discord.LoggerTextChannel.POST
          );
        }

        // Log event to prevent duplicates
        if (config.groups[i].discord.ServerID == config.TestingServerID) {
          await databases[i].GroupEvents.create(event);
        } else {
          await databases[i].GroupEvents.create({ eventId: event.id, eventJSON: JSON.stringify(event) });
        }
      }
    } /*catch (error) {
      console.error("Error fetching audit logs:", error);
    }*/
  }
}

// Helper to create an embed message with a button, in either a channel or thread
async function postEventEmbed(
  event,
  UserEvents,
  action,
  buttonStyle,
  LoggerTextChannel
) {
  const channel = client.channels.cache.get(`${LoggerTextChannel}`);

  const targetId = event.targetId.startsWith("usr_")
    ? `${event.targetId.replace("usr_", "")}`
    : `${event.actorId.replace("usr_", "")}`;

  const userdata = await GetUsers(`usr_${targetId}`);

  if (event.eventType == "group.instance.close") {
    // Embed setup
    const worldId = event.targetId.split(':')[0];
    const world = await getWorldInfo(worldId);

    const embed = new EmbedBuilder()
      .setColor(0x00ff04)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription("Closed an instance")
      .setImage(`${world.data.imageUrl}`)
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "World name:",
          value: `${world.data.name}`,
          inline: false
        },
        {
          name: "World description:",
          value: `${world.data.description}`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${event.actorDisplayName} Event`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  } else if (event.eventType == "group.instance.create") {
    // Embed setup

    const worldId = event.targetId.split(':')[0];
    const world = await getWorldInfo(worldId);

    const embed = new EmbedBuilder()
      .setColor(0x00ff04)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription("Created an instance")
      .setImage(`${world.data.imageUrl}`)
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "World name:",
          value: `${world.data.name}`,
          inline: false
        },
        {
          name: "World description:",
          value: `${world.data.description}`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${event.actorDisplayName} Event`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  } else if (event.eventType == "group.member.leave") {
    const userGroupsResult = await fetchUserGroups(`usr_${targetId}`);
    const blacklistGroupsResult = await GetBlacklistUsersGroups(
      `usr_${targetId}`
    );

    // Map and join group names
    const groupFields = [];
    let groupNamesArray = [];

    if (Array.isArray(userGroupsResult.data)) {
      groupNamesArray = userGroupsResult.data.map(group => group.name);
    } else {
      console.error(
        "Error fetching audit logs: Invalid or missing 'data' property in userGroupsResult"
      );
    }

    // Create multiple fields if the total length exceeds the limit
    let currentField = "";
    for (const name of groupNamesArray) {
      // Check if adding the next group would exceed the character limit
      if ((currentField + name + "\n").length > 1024) {
        groupFields.push({
          name: groupFields.length === 0 ? "Member of Groups:" : "Continued:",
          value: currentField.trim(),
          inline: false
        });
        currentField = ""; // Start a new field
      }
      currentField += `${name}\n`; // Add group name to the current field
    }

    // Push the last remaining group names
    if (currentField) {
      groupFields.push({
        name: groupFields.length === 0 ? "Member of Groups:" : "Continued:",
        value: currentField.trim(),
        inline: false
      });
    }

    // Fallback if no groups are found
    if (groupFields.length === 0) {
      groupFields.push({
        name: "Member of Groups:",
        value: "None",
        inline: false
      });
    }

    // Initialize fields for blacklisted groups
    let blacklistGroupFields = [];

    // Handle the response for blacklisted groups
    if (
      blacklistGroupsResult.found &&
      Array.isArray(blacklistGroupsResult.data)
    ) {
      const blacklistGroupNamesArray = blacklistGroupsResult.data.map(
        group => group.name
      );

      // Create multiple fields if the total length exceeds the limit
      let currentBlacklistField = "";
      for (const name of blacklistGroupNamesArray) {
        if ((currentBlacklistField + name + "\n").length > 1024) {
          blacklistGroupFields.push({
            name:
              blacklistGroupFields.length === 0
                ? "Blacklisted Groups:"
                : "Continued:",
            value: currentBlacklistField.trim(),
            inline: false
          });
          currentBlacklistField = ""; // Start a new field
        }
        currentBlacklistField += `${name}\n`;
      }

      // Push the last remaining group names
      if (currentBlacklistField) {
        blacklistGroupFields.push({
          name:
            blacklistGroupFields.length === 0
              ? "Blacklisted Groups:"
              : "Continued:",
          value: currentBlacklistField.trim(),
          inline: false
        });
      }
    } else {
      // No blacklisted groups found
      blacklistGroupFields.push({
        name: "Blacklisted Groups:",
        value: "None",
        inline: false
      });
    }

    // Embed setup

    const embed = new EmbedBuilder()
      .setColor(0x00ff04)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription("Left the group")
      .setImage(`${userdata.data.currentAvatarImageUrl}`)
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "User Bio:",
          value: userdata.data.bio || "N/A", // Check for empty value
          inline: false
        },
        ...groupFields, // Dynamically add group fields
        ...blacklistGroupFields, // Blacklisted Groups fields
        {
          name: "VRC UserId:",
          value: `${userdata.data.id}`,
          inline: false
        },
        {
          name: "Date Joined:",
          value: `${userdata.data.date_joined}`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${event.actorDisplayName} Event`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  } else if (event.eventType == "group.member.join") {
    const userGroupsResult = await fetchUserGroups(`usr_${targetId}`);
    const blacklistGroupsResult = await GetBlacklistUsersGroups(
      `usr_${targetId}`
    );

    // Map and join group names
    const groupFields = [];
    let groupNamesArray = [];

    if (Array.isArray(userGroupsResult.data)) {
      groupNamesArray = userGroupsResult.data.map(group => group.name);
    } else {
      console.error(
        "Error fetching audit logs: Invalid or missing 'data' property in userGroupsResult"
      );
    }

    // Create multiple fields if the total length exceeds the limit
    let currentField = "";
    for (const name of groupNamesArray) {
      // Check if adding the next group would exceed the character limit
      if ((currentField + name + "\n").length > 1024) {
        groupFields.push({
          name: groupFields.length === 0 ? "Member of Groups:" : "Continued:",
          value: currentField.trim(),
          inline: false
        });
        currentField = ""; // Start a new field
      }
      currentField += `${name}\n`; // Add group name to the current field
    }

    // Push the last remaining group names
    if (currentField) {
      groupFields.push({
        name: groupFields.length === 0 ? "Member of Groups:" : "Continued:",
        value: currentField.trim(),
        inline: false
      });
    }

    // Fallback if no groups are found
    if (groupFields.length === 0) {
      groupFields.push({
        name: "Member of Groups:",
        value: "None",
        inline: false
      });
    }

    // Initialize fields for blacklisted groups
    let blacklistGroupFields = [];

    // Handle the response for blacklisted groups
    if (
      blacklistGroupsResult.found &&
      Array.isArray(blacklistGroupsResult.data)
    ) {
      const blacklistGroupNamesArray = blacklistGroupsResult.data.map(
        group => group.name
      );

      // Create multiple fields if the total length exceeds the limit
      let currentBlacklistField = "";
      for (const name of blacklistGroupNamesArray) {
        if ((currentBlacklistField + name + "\n").length > 1024) {
          blacklistGroupFields.push({
            name:
              blacklistGroupFields.length === 0
                ? "Blacklisted Groups:"
                : "Continued:",
            value: currentBlacklistField.trim(),
            inline: false
          });
          currentBlacklistField = ""; // Start a new field
        }
        currentBlacklistField += `${name}\n`;
      }

      // Push the last remaining group names
      if (currentBlacklistField) {
        blacklistGroupFields.push({
          name:
            blacklistGroupFields.length === 0
              ? "Blacklisted Groups:"
              : "Continued:",
          value: currentBlacklistField.trim(),
          inline: false
        });
      }
    } else {
      // No blacklisted groups found
      blacklistGroupFields.push({
        name: "Blacklisted Groups:",
        value: "None",
        inline: false
      });
    }

    // Embed setup
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff04)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription("Joined the group")
      .setImage(`${userdata.data.currentAvatarImageUrl}`)
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "User Bio:",
          value: userdata.data.bio || "N/A", // Check for empty value
          inline: false
        },
        ...groupFields, // Dynamically add group fields
        ...blacklistGroupFields, // Blacklisted Groups fields
        {
          name: "VRC UserId:",
          value: `${userdata.data.id}`,
          inline: false
        },
        {
          name: "Date Joined:",
          value: `${userdata.data.date_joined}`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${event.actorDisplayName} Event`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  } else if (
    [
      "group.user.unban",
      "group.user.ban",
      "group.instance.warn",
      "group.instance.kick",
      "group.member.remove"
    ].includes(event.eventType)
  ) {
    let description;

    switch (String(event.eventType)) {
      case "group.user.unban":
        description = "Was unbanned";
        break;
      case "group.user.ban":
        description = "Was banned";
        break;
      case "group.instance.warn":
        description = "Was warned";
        break;
      case "group.instance.kick":
        description = "Was kicked";
        break;
      case "group.member.remove":
        description = "Was removed";
        break;
    }

    // Fetch the user counters from SQLite
    const userEventData = await UserEvents.findOne({
      where: { userId: `usr_${targetId}` }
    });

    // Set default values if no record is found
    const bans = userEventData ? userEventData.bans : 0;
    const unbans = userEventData ? userEventData.unbans : 0;
    const kicks = userEventData ? userEventData.kicks : 0;
    const warnings = userEventData ? userEventData.warnings : 0;

    const userGroupsResult = await fetchUserGroups(`usr_${targetId}`);
    const blacklistGroupsResult = await GetBlacklistUsersGroups(
      `usr_${targetId}`
    );

    // Map and join group names
    const groupFields = [];
    let groupNamesArray = [];

    if (Array.isArray(userGroupsResult.data)) {
      groupNamesArray = userGroupsResult.data.map(group => group.name);
    } else {
      console.error(
        "Error fetching audit logs: Invalid or missing 'data' property in userGroupsResult"
      );
    }

    // Create multiple fields if the total length exceeds the limit
    let currentField = "";
    for (const name of groupNamesArray) {
      // Check if adding the next group would exceed the character limit
      if ((currentField + name + "\n").length > 1024) {
        groupFields.push({
          name: groupFields.length === 0 ? "Member of Groups:" : "Continued:",
          value: currentField.trim(),
          inline: false
        });
        currentField = ""; // Start a new field
      }
      currentField += `${name}\n`; // Add group name to the current field
    }

    // Push the last remaining group names
    if (currentField) {
      groupFields.push({
        name: groupFields.length === 0 ? "Member of Groups:" : "Continued:",
        value: currentField.trim(),
        inline: false
      });
    }

    // Fallback if no groups are found
    if (groupFields.length === 0) {
      groupFields.push({
        name: "Member of Groups:",
        value: "None",
        inline: false
      });
    }

    // Initialize fields for blacklisted groups
    let blacklistGroupFields = [];

    // Handle the response for blacklisted groups
    if (
      blacklistGroupsResult.found &&
      Array.isArray(blacklistGroupsResult.data)
    ) {
      const blacklistGroupNamesArray = blacklistGroupsResult.data.map(
        group => group.name
      );

      // Create multiple fields if the total length exceeds the limit
      let currentBlacklistField = "";
      for (const name of blacklistGroupNamesArray) {
        if ((currentBlacklistField + name + "\n").length > 1024) {
          blacklistGroupFields.push({
            name:
              blacklistGroupFields.length === 0
                ? "Blacklisted Groups:"
                : "Continued:",
            value: currentBlacklistField.trim(),
            inline: false
          });
          currentBlacklistField = ""; // Start a new field
        }
        currentBlacklistField += `${name}\n`;
      }

      // Push the last remaining group names
      if (currentBlacklistField) {
        blacklistGroupFields.push({
          name:
            blacklistGroupFields.length === 0
              ? "Blacklisted Groups:"
              : "Continued:",
          value: currentBlacklistField.trim(),
          inline: false
        });
      }
    } else {
      // No blacklisted groups found
      blacklistGroupFields.push({
        name: "Blacklisted Groups:",
        value: "None",
        inline: false
      });
    }

    // Embed setup
    const embed = new EmbedBuilder()
      .setColor(buttonStyle === ButtonStyle.Danger ? 0xff0000 : 0x00ff04)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription(description)
      .setImage(`${userdata.data.currentAvatarImageUrl}`)
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "Moderated by:",
          value: `${event.actorDisplayName}`,
          inline: false
        },
        {
          name: "VRC UserId:",
          value: `${userdata.data.id}`,
          inline: false
        },
        {
          name: "User Status:",
          value: userdata.data.statusDescription || "N/A", // Check for empty value
          inline: false
        },
        {
          name: "User Bio:",
          value: userdata.data.bio || "N/A", // Check for empty value
          inline: false
        },
        ...groupFields, // Dynamically add group fields
        ...blacklistGroupFields, // Blacklisted Groups fields
        {
          name: "Date Joined:",
          value: `${userdata.data.date_joined}`,
          inline: false
        },
        {
          name: "Bans:",
          value: `${bans} Events`,
          inline: false
        },
        {
          name: "UnBans:",
          value: `${unbans} Events`,
          inline: false
        },
        {
          name: "Kicks:",
          value: `${kicks} Events`,
          inline: false
        },
        {
          name: "Warns:",
          value: `${warnings} Events`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    if (action == "ban") {
      banbutton = new ButtonBuilder()
        .setCustomId(`unban://usr_${targetId}`)
        .setLabel("UNBAN USER")
        .setStyle(buttonStyle);
    } else if (action == "unban") {
      banbutton = new ButtonBuilder()
        .setCustomId(`ban://usr_${targetId}`)
        .setLabel("BAN USER")
        .setStyle(buttonStyle);
    }

    const row = new ActionRowBuilder().addComponents(banbutton);

    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${String(userdata.data.displayName)}`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed], components: [row] });
    } else {
      message = await channel.send({ embeds: [embed], components: [row] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  } else if (event.eventType == "group.post.create") {
    // Embed setup
    const embed = new EmbedBuilder()
      .setColor(0x00ff04)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription("Created a post")
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "Title:",
          value: `${event.data.title}`,
          inline: false
        },
        {
          name: "Text:",
          value: `${event.data.text}`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    if (event.data.imageId) {
      imageFile = await getFileInfo(event.data.imageId);
      imageUrl = imageFile.data.versions[1].file.url;
      embed.setImage(imageUrl);
    }

    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${String(userdata.data.displayName)} Event`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  } else if (event.eventType == "group.post.delete") {

    if (event.data.imageId) {
      imageFile = await getFileInfo(event.data.imageId);
      imageUrl = imageFile.data.versions[1].file.url;
    }

    // Embed setup
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`${userdata.data.displayName}`)
      .setDescription("Deleted a post")
      .setURL(`https://vrchat.com/home/user/usr_${targetId}`)
      .setFields([
        {
          name: "Title:",
          value: `${event.data.title}`,
          inline: false
        },
        {
          name: "Text:",
          value: `${event.data.text}`,
          inline: false
        }
      ])
      .setTimestamp(new Date(event.created_at))
      .setFooter({ text: "VRChat Moderation Event" });

    if (event.data.imageId) {
      imageFile = await getFileInfo(event.data.imageId);
      imageUrl = imageFile.data.versions[1].file.url;
      embed.setImage(imageUrl);
    }
    
    // Check if the channel is of type `GuildText`, which supports threads
    let message;
    if (channel.type === 0) {
      const thread = await channel.threads.create({
        name: `${userdata.data.displayName} Event`,
        autoArchiveDuration: 60
      });
      message = await thread.send({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
    }

    // Update user events in SQLite
    await logUserEvent(event, UserEvents);
  }
}

// Helper to update user events in the database
async function logUserEvent(event, UserEvents) {
  const userEvent = await UserEvents.findOrCreate({
    where: { userId: event.targetId },
    defaults: {
      userId: event.targetId,
      bans: 0,
      unbans: 0,
      kicks: 0,
      warnings: 0,
      joins: 0,
      leaves: 0
    }
  });

  switch (event.eventType) {
    case "group.user.ban":
      await userEvent[0].increment("bans");
      break;
    case "group.user.unban":
      await userEvent[0].increment("unbans");
      break;
    case "group.instance.kick":
      await userEvent[0].increment("kicks");
      break;
    case "group.instance.warn":
      await userEvent[0].increment("warnings");
      break;
    case "group.member.join":
      await userEvent[0].increment("joins");
      break;
    case "group.member.leave":
    case "group.member.remove":
      await userEvent[0].increment("leaves");
      break;
  }
  await userEvent[0].save();
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  let i = 0;
  for (; i < config.groups.length && config.groups[i].discord.ServerID != interaction.guild.id; i++);

  if (await isUserModerator(interaction.member)) {
    if (interaction.customId.startsWith("ban://")) {
      // Ban logic
      BanGroupUser(
        config.groups[i].vrc.groupid,
        `${interaction.customId.replace("ban://", "")}`
      ).then(async data => {
        await interaction.reply({
          content: `User has been banned.`,
          ephemeral: false
        });
      });
    } else if (interaction.customId.startsWith("unban://")) {
      // Unban logic
      UnbanGroupUser(
        config.groups[i].vrc.groupid,
        `${interaction.customId.replace("unban://", "")}`
      ).then(async data => {
        await interaction.reply({
          content: `User has been unbanned.`,
          ephemeral: false
        });
      });
    }
  } else {
    await interaction.reply({
      content: `<@${interaction.user
        .id}>: **YOU DO NOT HAVE PERMISSION TO DO THIS!**`,
      ephemeral: false
    });
  }
});

module.exports = {
  checkForUpdates
};

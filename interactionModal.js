client = require("../index");
const i18n = require("i18n");
i18n.setLocale("en");
const { Sequelize, DataTypes } = require("sequelize");
const {
  EmbedBuilder,
  PermissionFlagsBits,
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const config = require("../config/settings.json");

const { databases } = require("../database/database.js");

const { BanGroupUser, UnbanGroupUser } = require("../utils/vrchat.js");

const GamingClientSequelize = new Sequelize(
  "VRClogger",
  config.SQL.USER,
  config.SQL.PASS,
  {
    host: config.SQL.HOST,
    dialect: "mysql",
    logging: false // Set to true to see SQL queries in console
  }
);

const GroupEvents = GamingClientSequelize.define("events", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  eventId: {
    type: DataTypes.STRING,
    primaryKey: true
  }
});

const GroupUserEvent = GamingClientSequelize.define("user_events", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  bans: DataTypes.INTEGER,
  unbans: DataTypes.INTEGER,
  kicks: DataTypes.INTEGER,
  warnings: DataTypes.INTEGER,
  joins: DataTypes.INTEGER,
  leaves: DataTypes.INTEGER
});

const VRCBlacklist = GamingClientSequelize.define("vrc_vrcga_blacklists", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  userID: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  ripper: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  crasher: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  cyberbully: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  banned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  clients: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  troll: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  racism: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  underaged: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  moderator: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  pending: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  blacklisted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
});

const VRCAVIBlacklist = GamingClientSequelize.define(
  "vrc_vrcga_blacklist_avatars",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    displayName: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    userId: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    avatarId: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    reason: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    ripper: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    crasher: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    blacklisted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }
);

const ApiKey = GamingClientSequelize.define("ApiKey", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  userId: { type: DataTypes.STRING, allowNull: false },
  displayName: { type: DataTypes.STRING, allowNull: false },
  key: { type: DataTypes.STRING, allowNull: false },
  isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
  usageLimit: { type: DataTypes.INTEGER, defaultValue: 100 }
});

// Define the MusicQueue model
const VRCBLQueue = GamingClientSequelize.define("VRC_Bot_BanListQueue", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  groupId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  actions: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

const VRCStaffList = GamingClientSequelize.define("VRC_Bot_StaffList", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dateadded: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
});

const VRCBlacklistGroups = GamingClientSequelize.define(
  "vrc_vrcga_blacklist_groups",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    groupID: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    reason: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    hostile: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    crasher: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    hateraid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    ripper: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    clients: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    troll: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    moderator: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    pending: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    blacklisted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }
);

GamingClientSequelize.sync();

async function getActiveStaffIds() {
  try {
    const activeStaff = await VRCStaffList.findAll({
      attributes: ["userId"],
      where: { active: true }
    });
    return activeStaff.map(staff => staff.userId);
  } catch (error) {
    console.error("Error fetching active group IDs:", error);
    throw error;
  }
}

async function isUserModerator(member) {
  let i = 0;
  for (; i < config.groups.length && member.guild.id != config.groups[i].discord.ServerID; i++);

  for (let roleid of config.groups[i].discord.moderatorID) {
    if (member.roles.cache.has(roleid)) return true;
  }
  for (let staffrole of await databases[i].VRCStaffList.findAll()) {
    if (member.roles.cache.has(staffrole.roleId)) return true;
  }

  return false;
}

function VRCBanGroupUser(groupId, userId) {
  return new Promise((resolve, reject) => {
    // Simulate banning user (replace with actual logic)
    setTimeout(() => {
      BanGroupUser(groupId, userId).then(data => {
        resolve(`User ${userId} banned from group ${groupId}`);
      });
    }, 1000); // Simulating ban, adjust timing as needed
  });
}

function VRCUnBanGroupUser(groupId, userId) {
  return new Promise((resolve, reject) => {
    // Simulate banning user (replace with actual logic)
    setTimeout(() => {
      UnbanGroupUser(groupId, userId).then(data => {
        resolve(`User ${userId} unbanned from group ${groupId}`);
      });
    }, 1000); // Simulating ban, adjust timing as needed
  });
}

function executeNext() {
  VRCBLQueue.findOne().then(item => {
    if (item) {
      //console.log(item)
      if (item.actions == "ban") {
        VRCBanGroupUser(item.groupId, item.userId)
          .then(data => {
            item.destroy(); // Remove item from queue after processing
          })
          .catch(error => {
            console.error(error);
          });
      } else if (item.actions == "unban") {
        VRCUnBanGroupUser(item.groupId, item.userId)
          .then(data => {
            item.destroy(); // Remove item from queue after processing
          })
          .catch(error => {
            console.error(error);
          });
      }
    }
  });
}

// Define addToQueue function
function addToQueue(groupId, userId, actions) {
  VRCBLQueue.create({
    groupId,
    userId,
    actions
  })
    .then(() => {})
    .catch(error => {
      console.error(error);
    });
}

setInterval(() => {
  executeNext(); // Ensure queue is processed regularly
}, 10000); // Process queue every 1 minute

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  let i = 0;
  for (; i < config.groups.length && interaction.guild.id != config.groups[i].discord.ServerID; i++);

  if (interaction.customId === "vrcuserblacklist") {
    // Get the data entered by the user
    const toggledel = interaction.fields.getTextInputValue("togglesdel");
    const userID = interaction.fields.getTextInputValue("userid");
    const displayName = interaction.fields.getTextInputValue("displayname");
    const reason = interaction.fields.getTextInputValue("reason");
    const optionsString = interaction.fields.getTextInputValue("options");
    const optionsArray = optionsString.split(",");
    const availableOptions = [
      "ripper",
      "crasher",
      "hateraid",
      "clients",
      "troll",
      "racism",
      "underaged"
    ];

    const selectedOptions = {};

    availableOptions.forEach(option => {
      selectedOptions[option] = optionsArray.includes(option);
    });

    // Check if all options are included in the object
    availableOptions.forEach(option => {
      if (!(option in selectedOptions)) {
        selectedOptions[option] = false;
      }
    });

    if (selectedOptions.ripper) {
      var ripper = true;
    } else {
      var ripper = false;
    }

    if (selectedOptions.crasher) {
      var crasher = true;
    } else {
      var crasher = false;
    }

    if (selectedOptions.hateraid) {
      var cyberbully = true;
    } else {
      var cyberbully = false;
    }

    if (selectedOptions.clients) {
      var clients = true;
    } else {
      var clients = false;
    }

    if (selectedOptions.troll) {
      var troll = true;
    } else {
      var troll = false;
    }

    if (selectedOptions.racism) {
      var racism = true;
    } else {
      var racism = false;
    }

    if (selectedOptions.underaged) {
      var underaged = true;
    } else {
      var underaged = false;
    }

    if (toggledel == "add") {
      const existingUser = await VRCBlacklist.findOne({
        where: {
          userID: userID
        }
      });
      if (existingUser) {
        console.log("User already exists");
        await interaction.reply({
          content: "User already exists! Updating"
        });

        // Update the user record
        await VRCBlacklist.update(
          {
            reason,
            ripper,
            crasher,
            cyberbully,
            clients,
            troll,
            racism,
            underaged,
            moderator: `${interaction.user.username}`,
            pending: false,
            blacklisted: true
          },
          {
            where: {
              userID: userID
            }
          }
        );
      } else {
        const result = await VRCBlacklist.create({
          displayName,
          userID,
          reason,
          ripper,
          crasher,
          cyberbully,
          clients,
          troll,
          racism,
          underaged,
          moderator: `${interaction.user.username}`,
          pending: false,
          blacklisted: true
        });

        addToQueue(config.VRCAPI.groupid, userID, "ban");

        await interaction.reply({
          content: "Your submission was received successfully!"
        });
      }
    } else if (toggledel == "remove") {
      const existingUser = await VRCBlacklist.findOne({
        where: {
          userID: userID
        }
      });
      if (existingUser) {
        // Update the user record
        await VRCBlacklist.update(
          {
            clients: false,
            crasher: false,
            cyberbully: false,
            ripper: false,
            troll: false,
            racism: false,
            underaged: false,
            pending: false,
            blacklisted: false
          },
          {
            where: {
              userID: userID
            }
          }
        );

        addToQueue(config.VRCAPI.groupid, userID, "unban");

        await interaction.reply({
          content: "Your submission was updated successfully!"
        });
      } else {
        await interaction.reply({
          content: "User not found!"
        });
      }
    } else {
      await interaction.reply({
        content:
          "Sorry, you didnt entered Coreect infomation Please re-enter it!"
      });
    }
  } else if (interaction.customId === "vrcgroupsblacklist") {
    // Get the data entered by the user
    const toggledel = interaction.fields.getTextInputValue("togglesdel");
    const groupID = interaction.fields.getTextInputValue("groupid");
    const groupdisplayname = interaction.fields.getTextInputValue(
      "groupdisplayname"
    );
    const reason = interaction.fields.getTextInputValue("reason");
    const optionsString = interaction.fields.getTextInputValue("options");
    const optionsArray = optionsString.split(",");
    const availableOptions = [
      "ripper",
      "crasher",
      "hateraid",
      "clients",
      "troll",
      "hostile"
    ];

    const selectedOptions = {};

    availableOptions.forEach(option => {
      selectedOptions[option] = optionsArray.includes(option);
    });

    // Check if all options are included in the object
    availableOptions.forEach(option => {
      if (!(option in selectedOptions)) {
        selectedOptions[option] = false;
      }
    });

    if (selectedOptions.ripper) {
      var ripper = true;
    } else {
      var ripper = false;
    }

    if (selectedOptions.crasher) {
      var crasher = true;
    } else {
      var crasher = false;
    }

    if (selectedOptions.hateraid) {
      var cyberbully = true;
    } else {
      var cyberbully = false;
    }

    if (selectedOptions.clients) {
      var clients = true;
    } else {
      var clients = false;
    }

    if (selectedOptions.troll) {
      var troll = true;
    } else {
      var troll = false;
    }

    if (selectedOptions.hostile) {
      var hostile = true;
    } else {
      var hostile = false;
    }

    if (toggledel == "add") {
      const existingUser = await VRCBlacklistGroups.findOne({
        where: {
          groupID: groupID
        }
      });
      if (existingUser) {
        console.log("Group already exists");
        await interaction.reply({
          content: "Group already exists! Updating"
        });

        // Update the user record
        await VRCBlacklistGroups.update(
          {
            reason,
            ripper,
            crasher,
            cyberbully,
            clients,
            troll,
            hostile,
            moderator: `${interaction.user.username}`,
            pending: false,
            blacklisted: true
          },
          {
            where: {
              userID: userID
            }
          }
        );
      } else {
        const result = await VRCBlacklistGroups.create({
          name: groupdisplayname,
          groupID,
          reason,
          ripper,
          crasher,
          cyberbully,
          clients,
          troll,
          hostile,
          moderator: `${interaction.user.username}`,
          pending: false,
          blacklisted: true
        });
        await interaction.reply({
          content: "Your submission was received successfully!"
        });
      }
    } else if (toggledel == "remove") {
      const existingUser = await VRCBlacklistGroups.findOne({
        where: {
          groupID: groupID
        }
      });
      if (existingUser) {
        // Update the user record
        await VRCBlacklistGroups.update(
          {
            clients: false,
            crasher: false,
            cyberbully: false,
            ripper: false,
            troll: false,
            hostile: false,
            pending: false,
            blacklisted: false
          },
          {
            where: {
              groupID: groupID
            }
          }
        );
        await interaction.reply({
          content: "Your submission was updated successfully!"
        });
      } else {
        await interaction.reply({
          content: "User not found!"
        });
      }
    } else {
      await interaction.reply({
        content:
          "Sorry, you didnt entered Coreect infomation Please re-enter it!"
      });
    }
  } else if (interaction.customId === "vrcaviblacklist") {
    // Get the data entered by the user
    const toggledel = interaction.fields.getTextInputValue("togglesdel");
    const userId = interaction.fields.getTextInputValue("userid");
    const avatarId = interaction.fields.getTextInputValue("avatarid");
    const reason = interaction.fields.getTextInputValue("reason");
    const optionsString = interaction.fields.getTextInputValue("options");
    const optionsArray = optionsString.split(",");
    const availableOptions = ["ripper", "crasher"];

    const selectedOptions = {};

    availableOptions.forEach(option => {
      selectedOptions[option] = optionsArray.includes(option);
    });

    // Check if all options are included in the object
    availableOptions.forEach(option => {
      if (!(option in selectedOptions)) {
        selectedOptions[option] = false;
      }
    });

    if (selectedOptions.ripper) {
      var ripper = true;
    } else {
      var ripper = false;
    }

    if (selectedOptions.crasher) {
      var crasher = true;
    } else {
      var crasher = false;
    }

    if (toggledel == "add") {
      const existingUser = await VRCAVIBlacklist.findOne({
        where: {
          avatarId: avatarId
        }
      });
      if (existingUser) {
        console.log("Avatar already exists");
        await interaction.reply({
          content: "Avatar already exists! Updating"
        });

        // Update the user record
        await VRCAVIBlacklist.update(
          {
            reason,
            ripper,
            crasher
          },
          {
            where: {
              avatarId: avatarId
            }
          }
        );
      } else {
        const result = await VRCAVIBlacklist.create({
          displayName: null,
          userId,
          avatarId,
          reason,
          ripper,
          crasher,
          blacklisted: true
        });
        await interaction.reply({
          content: "Your submission was received successfully!"
        });
      }
    } else if (toggledel == "remove") {
      const existingUser = await VRCAVIBlacklist.findOne({
        where: {
          avatarId: avatarId
        }
      });
      if (existingUser) {
        // Update the user record
        await VRCAVIBlacklist.update(
          {
            crasher: false,
            ripper: false,
            blacklisted: false
          },
          {
            where: {
              avatarId: avatarId
            }
          }
        );
        await interaction.reply({
          content: "Your submission was updated successfully!"
        });
      } else {
        await interaction.reply({
          content: "Avatar not found!"
        });
      }
    } else {
      await interaction.reply({
        content:
          "Sorry, you didnt entered Coreect infomation Please re-enter it!"
      });
    }
  } else if (interaction.customId === "vrcuserban") {
    // Get the data entered by the user
    const userID = interaction.fields.getTextInputValue("userid");

    const resp = await BanGroupUser(config.groups[i].vrc.groupid, userID);

    if (resp.data) {
      console.log(`User ${userID} banned from ${config.groups[i].name} (${config.groups[i].vrc.groupid})`);
      await interaction.reply({
        content: `User ${userID} banned from ${config.groups[i].name} (${config.groups[i].vrc.groupid})`
      });
    } else {
      await interaction.reply({
        content: `Failed to ban ${userID}`
      });
    }
  } else if (interaction.customId === "vrcuserunban") {
    // Get the data entered by the user
    const userID = interaction.fields.getTextInputValue("userid");

    const resp = await UnbanGroupUser(config.groups[i].vrc.groupid, userID);

    if (resp.data) {
      console.log(`User ${userID} unbanned from ${config.groups[i].name} (${config.groups[i].vrc.groupid})`);
      await interaction.reply({
        content: `User ${userID} unbanned from ${config.groups[i].name} (${config.groups[i].vrc.groupid})`
      });
    } else {
      await interaction.reply({
        content: `Failed to unban ${userID}`
      });
    }
  }
});

module.exports = {
  getActiveStaffIds,
  isUserModerator,
  VRCBlacklistGroups,
  VRCAVIBlacklist,
  VRCBlacklist,
  GroupUserEvent,
  GroupEvents,
  VRCStaffList,
  ApiKey
};

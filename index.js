import { Client, EmbedBuilder, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

// Channel ID -> Role ID mapping
const ROLE_MAPPINGS = {
  '1562529179315208232': '1563560922843324436',
  '1563559616170696815': '1563560605603069962',
  '1563559843346780231': '1563560697894543491',
  '1563560033512464404': '1563560753691238510',
  '1563560113653022730': '1563560415068295298',
  '1563560196436136027': '1563560530323439646',
};

// Rate limiting data storage
// Structure: { userId: { usageTimestamps: [ms, ms], blockedUntil: ms } }
const userCooldowns = new Map();

// Define Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('req-help')
    .setDescription('Request help for a specific issue')
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('The reason you need help')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Displays all available commands'),
].map(command => command.toJSON());

// Register Global Commands
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Registering global slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Successfully registered global commands!');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

// Interaction Listener
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId, user } = interaction;
  const now = Date.now();

  if (commandName === 'req-help') {
    const ONE_HOUR = 60 * 60 * 1000;
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    let userData = userCooldowns.get(user.id);
    if (!userData) {
      userData = { usageTimestamps: [], blockedUntil: 0 };
      userCooldowns.set(user.id, userData);
    }

    // Check if user is currently blocked
    if (now < userData.blockedUntil) {
      const remainingHours = ((userData.blockedUntil - now) / (1000 * 60 * 60)).toFixed(1);
      return interaction.reply({
        content: `You have requested help too many times. You are blocked from using this command for another ${remainingHours} hours.`,
        ephemeral: true,
      });
    }

    // Filter out timestamps older than 1 hour
    userData.usageTimestamps = userData.usageTimestamps.filter(timestamp => now - timestamp < ONE_HOUR);

    // Check if limit exceeded (3 uses in 1 hour)
    if (userData.usageTimestamps.length >= 3) {
      userData.blockedUntil = now + SIX_HOURS;
      return interaction.reply({
        content: 'You have requested help more than 3 times within 1 hour. You cannot use this command for the next 6 hours.',
        ephemeral: true,
      });
    }

    // Record current usage
    userData.usageTimestamps.push(now);

    const reason = interaction.options.getString('reason');
    const roleId = ROLE_MAPPINGS[channelId];

    const embed = new EmbedBuilder()
      .setTitle('Help Request')
      .setDescription(`User: ${user}\nReason:\n\`\`\`${reason}\`\`\``);

    const pingText = roleId ? `<@&${roleId}>` : '';

    await interaction.reply({
      content: pingText || undefined,
      embeds: [embed],
    });
  }

  if (commandName === 'commands') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('Bot Commands')
      .setDescription('Overview of available commands and usage guidelines')
      .addFields(
        {
          name: '/req-help reason:[reason]',
          value: 'Submits a help request with your specified reason. Tags the responsible role for the current channel. Limited to 3 uses per hour (6 hour timeout if exceeded).',
        },
        {
          name: '/commands',
          value: 'Displays this command overview menu.',
        }
      );

    await interaction.reply({
      embeds: [helpEmbed],
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
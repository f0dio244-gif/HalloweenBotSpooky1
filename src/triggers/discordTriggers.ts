import { Client, GatewayIntentBits, Events, Message, TextChannel, Interaction } from "discord.js";
import { Mastra } from "@mastra/core";
import { IMastraLogger } from "@mastra/core/logger";

let discordClient: Client | null = null;

export async function getDiscordClient(logger?: IMastraLogger): Promise<Client> {
  if (discordClient && discordClient.isReady()) {
    return discordClient;
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN not found in environment variables");
  }

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  await new Promise<void>((resolve) => {
    discordClient!.once(Events.ClientReady, () => {
      logger?.info("🎃 [Discord] Bot connected and ready");
      resolve();
    });
    discordClient!.login(token);
  });

  return discordClient;
}

export type TriggerInfoDiscordOnMessage = {
  type: "discord/message";
  params: {
    userId: string;
    username: string;
    channelId: string;
    guildId: string;
    content: string;
  };
  payload: Message;
};

export type TriggerInfoDiscordOnButton = {
  type: "discord/button";
  params: {
    userId: string;
    username: string;
    channelId: string;
    guildId: string;
    customId: string;
  };
  payload: Interaction;
};

export async function registerDiscordTrigger({
  mastra,
  onMessage,
  onButton,
}: {
  mastra: Mastra;
  onMessage: (
    mastra: Mastra,
    triggerInfo: TriggerInfoDiscordOnMessage,
  ) => Promise<void>;
  onButton?: (
    mastra: Mastra,
    triggerInfo: TriggerInfoDiscordOnButton,
  ) => Promise<void>;
}) {
  const logger = mastra.getLogger();
  const client = await getDiscordClient(logger);

  client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Only process guild messages
    if (!message.guildId) return;

    try {
      await onMessage(mastra, {
        type: "discord/message",
        params: {
          userId: message.author.id,
          username: message.author.username,
          channelId: message.channelId,
          guildId: message.guildId,
          content: message.content,
        },
        payload: message,
      });
    } catch (error) {
      logger?.error("❌ [Discord] Error handling message", { error });
    }
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guildId) return;

    try {
      if (onButton) {
        await onButton(mastra, {
          type: "discord/button",
          params: {
            userId: interaction.user.id,
            username: interaction.user.username,
            channelId: interaction.channelId!,
            guildId: interaction.guildId,
            customId: interaction.customId,
          },
          payload: interaction,
        });
      }
    } catch (error) {
      logger?.error("❌ [Discord] Error handling button interaction", { error });
    }
  });

  return client;
}

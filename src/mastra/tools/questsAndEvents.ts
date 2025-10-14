import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { RuntimeContext } from "@mastra/core/di";
import { addCandyTool } from "./candyManager";
import { sharedPgPool } from "../storage";

const EMBED_COLOR = 0xe67e22;

// Quest system - generate daily quests
export const generateQuestsTool = createTool({
  id: "generate-quests",
  description: "Generates 3 daily quests for a user",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
    quests: z.array(z.any()),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId } = context;
    
    logger?.info("📋 [generateQuests] Generating quests", { userId, guildId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const existingQuests = await client.query(
        `SELECT * FROM discord_quests WHERE user_id = $1 AND guild_id = $2 AND completed = false`,
        [userId, guildId]
      );
      
      if (existingQuests.rows.length >= 3) {
        logger?.info("📋 [generateQuests] User already has quests", { userId });
        return { result: "already_has_quests", quests: existingQuests.rows };
      }
      
      const questTemplates = [
        { type: "social", description: "Trick 5 users", requiredProgress: 5, reward: 200, data: { command: "trickortreat", count: 5 } },
        { type: "social", description: "Help 3 teammates get candies", requiredProgress: 3, reward: 300, data: { type: "help_teammates" } },
        { type: "exploration", description: "Type in 3 different channels", requiredProgress: 3, reward: 150, data: { channels: [] } },
        { type: "exploration", description: "Use 5 different commands", requiredProgress: 5, reward: 250, data: { commands: [] } },
        { type: "luck", description: "Find the Hidden Ghost 👻", requiredProgress: 1, reward: 500, data: { type: "hidden_ghost" } },
        { type: "luck", description: "Catch 3 pumpkins", requiredProgress: 3, reward: 300, data: { type: "catch_pumpkins" } },
        { type: "purchase", description: "Buy a role under 2000 candies", requiredProgress: 1, reward: 400, data: { maxCost: 2000 } },
        { type: "collection", description: "Collect 500 candies", requiredProgress: 500, reward: 200, data: { type: "collect_candies" } },
      ];
      
      const selectedQuests = [];
      const shuffled = questTemplates.sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < 3; i++) {
        const quest = shuffled[i];
        const result = await client.query(
          `INSERT INTO discord_quests (user_id, guild_id, quest_type, quest_description, quest_data, required_progress, reward_candies)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [userId, guildId, quest.type, quest.description, JSON.stringify(quest.data), quest.requiredProgress, quest.reward]
        );
        selectedQuests.push(result.rows[0]);
      }
      
      logger?.info("📋 [generateQuests] Quests generated", { userId, count: selectedQuests.length });
      return { result: "quests_generated", quests: selectedQuests };
    } finally {
      client.release();
    }
  },
});

// View quests command
export const viewQuestsCommandTool = createTool({
  id: "view-quests-command",
  description: "View current quests",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, message } = context;
    
    logger?.info("📋 [viewQuests] Command executed", { userId, guildId });
    
    const runtimeContext = new RuntimeContext();
    const { quests } = await generateQuestsTool.execute({
      context: { userId, guildId },
      runtimeContext,
      mastra,
    });
    
    let questText = "📋 **YOUR DAILY QUESTS** 📋\n\n";
    
    quests.forEach((quest: any, index: number) => {
      const typeEmoji = quest.quest_type === "social" ? "👥" : 
                       quest.quest_type === "exploration" ? "🗺️" : 
                       quest.quest_type === "luck" ? "🍀" : 
                       quest.quest_type === "purchase" ? "🛒" : "📦";
      
      const status = quest.completed ? "✅" : `${quest.progress}/${quest.required_progress}`;
      questText += `${index + 1}. ${typeEmoji} **${quest.quest_description}**\n`;
      questText += `   └─ Progress: ${status} | Reward: ${quest.reward_candies} 🍬\n\n`;
    });
    
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(questText);
    
    await message.reply({ embeds: [embed] });
    logger?.info("📋 [viewQuests] Quests displayed", { userId, questCount: quests.length });
    
    return { result: "quests_displayed" };
  },
});

// Story mode commands
export const storyModeCommandTool = createTool({
  id: "story-mode-command",
  description: "Control story mode (start/stop/pause/resume)",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    action: z.enum(["start", "stop", "pause", "resume"]),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, action, message } = context;
    
    logger?.info("📖 [storyMode] Command executed", { userId, guildId, action });
    
    const member = message.member;
    const isAdmin = member?.permissions.has("Administrator");
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      if (action === "start") {
        if (!isAdmin) {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("❌ Only admins can start story mode!");
          
          await message.reply({ embeds: [embed] });
          return { result: "permission_denied" };
        }
        
        await client.query(
          `INSERT INTO discord_story_mode (guild_id, active, started_by, started_at)
           VALUES ($1, true, $2, NOW())
           ON CONFLICT (guild_id) DO UPDATE SET active = true, paused = false, started_by = $2, started_at = NOW(), current_chapter = 0`,
          [guildId, userId]
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle("📖 STORY MODE BEGINS! 📖")
          .setDescription("**Chapter 1: The Haunted Beginning**\n\nThe Halloween moon rises over the town, casting eerie shadows. Strange things are happening...\n\n*Story mode is now active! Special events and challenges will appear.*");
        
        await message.reply({ embeds: [embed] });
        logger?.info("📖 [storyMode] Story mode started", { guildId, userId });
      } else if (action === "stop") {
        if (!isAdmin) {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("❌ Only admins can stop story mode!");
          
          await message.reply({ embeds: [embed] });
          return { result: "permission_denied" };
        }
        
        await client.query(
          `UPDATE discord_story_mode SET active = false, paused = false WHERE guild_id = $1`,
          [guildId]
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("📖 **Story mode has ended!**");
        
        await message.reply({ embeds: [embed] });
        logger?.info("📖 [storyMode] Story mode stopped", { guildId });
      } else if (action === "pause") {
        if (!isAdmin) {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("❌ Only admins can pause story mode!");
          
          await message.reply({ embeds: [embed] });
          return { result: "permission_denied" };
        }
        
        await client.query(
          `UPDATE discord_story_mode SET paused = true WHERE guild_id = $1`,
          [guildId]
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("⏸️ **Story mode paused!**");
        
        await message.reply({ embeds: [embed] });
        logger?.info("📖 [storyMode] Story mode paused", { guildId });
      } else if (action === "resume") {
        if (!isAdmin) {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("❌ Only admins can resume story mode!");
          
          await message.reply({ embeds: [embed] });
          return { result: "permission_denied" };
        }
        
        await client.query(
          `UPDATE discord_story_mode SET paused = false WHERE guild_id = $1`,
          [guildId]
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("▶️ **Story mode resumed!**");
        
        await message.reply({ embeds: [embed] });
        logger?.info("📖 [storyMode] Story mode resumed", { guildId });
      }
    } finally {
      client.release();
    }
    
    return { result: "action_completed" };
  },
});

// Spooky market command
export const spookyMarketCommandTool = createTool({
  id: "spooky-market-command",
  description: "Access the spooky market with chance-based purchases",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, message } = context;
    
    logger?.info("🎪 [spookyMarket] Command executed", { userId, guildId });
    
    // 30% chance market is available
    if (Math.random() > 0.3) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("🎪 *The spooky market is not here right now... Try again later!*");
      
      await message.reply({ embeds: [embed] });
      return { result: "market_unavailable" };
    }
    
    const marketItems = [
      { name: "Mystery Box", cost: 500, rarity: "rare" },
      { name: "Cursed Amulet", cost: 1000, rarity: "epic" },
      { name: "Ancient Scroll", cost: 750, rarity: "uncommon" },
      { name: "Phantom Cloak", cost: 1500, rarity: "legendary" },
    ];
    
    const availableItem = marketItems[Math.floor(Math.random() * marketItems.length)];
    
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🎪 SPOOKY MARKET APPEARS! 🎪")
      .setDescription(`*A mysterious merchant emerges from the shadows...*\n\n**${availableItem.name}** (${availableItem.rarity})\n💰 Cost: **${availableItem.cost} candies**\n\nWill you purchase this mysterious item?`);
    
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`market_buy_${availableItem.name}_${availableItem.cost}_${availableItem.rarity}`)
          .setLabel(`Buy for ${availableItem.cost} candies`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("market_decline")
          .setLabel("Decline")
          .setStyle(ButtonStyle.Secondary)
      );
    
    await message.reply({ embeds: [embed], components: [row] });
    logger?.info("🎪 [spookyMarket] Market appeared", { userId, item: availableItem.name });
    
    return { result: "market_appeared" };
  },
});

// Trivia command
export const triviaCommandTool = createTool({
  id: "trivia-command",
  description: "Start a Halloween trivia question",
  inputSchema: z.object({
    guildId: z.string(),
    channelId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { guildId, channelId, message } = context;
    
    logger?.info("❓ [trivia] Command executed", { guildId, channelId });
    
    const triviaQuestions = [
      { question: "I walk at night, yet fear the light. What am I?", answer: "vampire", reward: 150 },
      { question: "What has no body, but comes alive on Halloween night?", answer: "ghost", reward: 150 },
      { question: "I'm carved with a face and glow from within. What am I?", answer: "pumpkin", reward: 100 },
      { question: "What creature turns under the full moon?", answer: "werewolf", reward: 200 },
      { question: "I fly on a broom and cast spells. Who am I?", answer: "witch", reward: 150 },
      { question: "What do you call a group of witches?", answer: "coven", reward: 250 },
    ];
    
    const selectedTrivia = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO discord_trivia (guild_id, channel_id, question, correct_answer, reward_candies)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [guildId, channelId, selectedTrivia.question, selectedTrivia.answer, selectedTrivia.reward]
      );
      
      const triviaId = result.rows[0].id;
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🎃 HALLOWEEN TRIVIA! 🎃")
        .setDescription(`**${selectedTrivia.question}**\n\n🍬 Reward: **${selectedTrivia.reward} candies**\n\nType your answer in chat!`);
      
      const triviaMessage = await message.reply({ embeds: [embed] });
      
      await client.query(
        `UPDATE discord_trivia SET message_id = $1 WHERE id = $2`,
        [triviaMessage.id, triviaId]
      );
      
      logger?.info("❓ [trivia] Trivia started", { triviaId, question: selectedTrivia.question });
    } finally {
      client.release();
    }
    
    return { result: "trivia_started" };
  },
});

// The Collector NPC commands
export const collectorOfferCommandTool = createTool({
  id: "collector-offer-command",
  description: "Offer an item to The Collector",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    itemId: z.number(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, itemId, message } = context;
    
    logger?.info("🎩 [collectorOffer] Command executed", { userId, itemId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const itemResult = await client.query(
        `SELECT * FROM discord_items WHERE id = $1 AND user_id = $2 AND used = false`,
        [itemId, userId]
      );
      
      if (itemResult.rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ Item not found or already used!");
        
        await message.reply({ embeds: [embed] });
        return { result: "item_not_found" };
      }
      
      const item = itemResult.rows[0];
      
      const rarityUpgrade: { [key: string]: string } = {
        common: "uncommon",
        uncommon: "rare",
        rare: "epic",
        epic: "legendary",
        legendary: "mythic",
      };
      
      const rewardRarity = rarityUpgrade[item.rarity] || "legendary";
      const rewardItems = ["Collector's Charm", "Ancient Relic", "Mystical Orb", "Cursed Treasure"];
      const rewardItem = rewardItems[Math.floor(Math.random() * rewardItems.length)];
      
      const result = await client.query(
        `INSERT INTO discord_collector_offers (user_id, guild_id, offered_item_id, reward_item_name, reward_item_rarity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, guildId, itemId, rewardItem, rewardRarity]
      );
      
      const offerId = result.rows[0].id;
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🎩 THE COLLECTOR APPEARS! 🎩")
        .setDescription(`*A mysterious figure in a top hat examines your **${item.item_name}**...*\n\n"Interesting... I'll give you a **${rewardItem}** (${rewardRarity}) for it."\n\nWhat will you do?`);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`collector_accept_${offerId}`)
            .setLabel("✅ Accept Deal")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`collector_bargain_${offerId}`)
            .setLabel("💰 Bargain")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`collector_refuse_${offerId}`)
            .setLabel("❌ Refuse")
            .setStyle(ButtonStyle.Danger)
        );
      
      await message.reply({ embeds: [embed], components: [row] });
      logger?.info("🎩 [collectorOffer] Offer created", { offerId, userId, itemId });
    } finally {
      client.release();
    }
    
    return { result: "offer_created" };
  },
});

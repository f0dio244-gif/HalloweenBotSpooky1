import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { RuntimeContext } from "@mastra/core/di";
import { addCandyTool, getCandyBalanceTool } from "./candyManager";
import { sharedPgPool } from "../storage";

const EMBED_COLOR = 0xe67e22;

// Item rarities and their colors
const RARITIES = {
  common: { name: "Common", emoji: "⚪", color: "#95a5a6" },
  uncommon: { name: "Uncommon", emoji: "🟢", color: "#2ecc71" },
  rare: { name: "Rare", emoji: "🔵", color: "#3498db" },
  epic: { name: "Epic", emoji: "🟣", color: "#9b59b6" },
  legendary: { name: "Legendary", emoji: "🟡", color: "#f1c40f" },
  mythic: { name: "Mythic", emoji: "🔴", color: "#e74c3c" },
};

// Inventory command
export const inventoryCommandTool = createTool({
  id: "inventory-command",
  description: "Displays user's inventory with items and potions",
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
    
    logger?.info("🎒 [inventory] Command executed", { userId, guildId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const itemsResult = await client.query(
        `SELECT * FROM discord_items WHERE user_id = $1 AND guild_id = $2 AND used = false ORDER BY acquired_at DESC`,
        [userId, guildId]
      );
      
      if (itemsResult.rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("🎒 **Your inventory is empty!** Collect items from pumpkins and events!");
        
        await message.reply({ embeds: [embed] });
        return { result: "inventory_empty" };
      }
      
      let inventoryText = "🎒 **YOUR INVENTORY** 🎒\n\n";
      
      const groupedItems: { [key: string]: any[] } = {};
      itemsResult.rows.forEach((item: any) => {
        const key = `${item.item_name}_${item.rarity}`;
        if (!groupedItems[key]) {
          groupedItems[key] = [];
        }
        groupedItems[key].push(item);
      });
      
      for (const [key, items] of Object.entries(groupedItems)) {
        const item = items[0];
        const rarity = RARITIES[item.rarity as keyof typeof RARITIES] || RARITIES.common;
        const count = items.length;
        inventoryText += `${rarity.emoji} **${item.item_name}** (${rarity.name}) x${count}\n`;
        if (item.boost_data) {
          inventoryText += `   └─ ${JSON.stringify(item.boost_data).substring(0, 50)}...\n`;
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(inventoryText);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("use_item")
            .setLabel("Use Item")
            .setStyle(ButtonStyle.Primary)
        );
      
      await message.reply({ embeds: [embed], components: [row] });
      logger?.info("🎒 [inventory] Inventory displayed", { userId, itemCount: itemsResult.rows.length });
    } finally {
      client.release();
    }
    
    return { result: "inventory_displayed" };
  },
});

// Profile command with achievements
export const profileCommandTool = createTool({
  id: "profile-command",
  description: "Displays user profile with achievements",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    guildId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, guildId, message } = context;
    
    logger?.info("👤 [profile] Command executed", { userId, guildId });
    
    const runtimeContext = new RuntimeContext();
    const { balance } = await getCandyBalanceTool.execute({
      context: { userId },
      runtimeContext,
      mastra,
    });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const achievementsResult = await client.query(
        `SELECT * FROM discord_achievements WHERE user_id = $1 ORDER BY earned_at DESC`,
        [userId]
      );
      
      const teamResult = await client.query(
        `SELECT team_name FROM discord_teams WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
      );
      
      const isVampire = await client.query(
        `SELECT * FROM discord_vampires WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
      );
      
      let profileText = `👤 **${username}'s Profile**\n\n`;
      profileText += `🍬 **Candies:** ${balance}\n`;
      
      if (teamResult.rows.length > 0) {
        profileText += `🏴 **Team:** ${teamResult.rows[0].team_name}\n`;
      }
      
      if (isVampire.rows.length > 0) {
        profileText += `🧛 **Status:** Vampire\n`;
      }
      
      profileText += `\n🏆 **Achievements** (${achievementsResult.rows.length})\n`;
      
      if (achievementsResult.rows.length === 0) {
        profileText += `No achievements yet!\n`;
      } else {
        achievementsResult.rows.slice(0, 10).forEach((achievement: any) => {
          profileText += `✨ **${achievement.achievement_name}**\n`;
        });
      }
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(profileText);
      
      await message.reply({ embeds: [embed] });
      logger?.info("👤 [profile] Profile displayed", { userId, achievements: achievementsResult.rows.length });
    } finally {
      client.release();
    }
    
    return { result: "profile_displayed" };
  },
});

// PVP challenge command
export const pvpChallengeCommandTool = createTool({
  id: "pvp-challenge-command",
  description: "Challenge another user to PVP",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    guildId: z.string(),
    targetUserId: z.string().optional(),
    wager: z.number().optional(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, guildId, targetUserId, wager = 0, message } = context;
    
    logger?.info("⚔️ [pvpChallenge] Command executed", { userId, targetUserId, wager });
    
    if (!targetUserId) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ Please mention a user to challenge! Usage: `!pvp @user [wager]`");
      
      await message.reply({ embeds: [embed] });
      return { result: "no_target" };
    }
    
    if (targetUserId === userId) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ You can't challenge yourself!");
      
      await message.reply({ embeds: [embed] });
      return { result: "self_challenge" };
    }
    
    const runtimeContext = new RuntimeContext();
    const { balance } = await getCandyBalanceTool.execute({
      context: { userId },
      runtimeContext,
      mastra,
    });
    
    if (wager > balance) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(`❌ You don't have enough candies! You have ${balance} but tried to wager ${wager}.`);
      
      await message.reply({ embeds: [embed] });
      return { result: "insufficient_funds" };
    }
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO discord_pvp (attacker_id, defender_id, guild_id, wager_candies)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, targetUserId, guildId, wager]
      );
      
      const pvpId = result.rows[0].id;
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("⚔️ PVP CHALLENGE! ⚔️")
        .setDescription(`**${username}** challenges <@${targetUserId}> to a battle!\n\n💰 Wager: **${wager} candies**\n\nAccept or decline the challenge!`);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`pvp_accept_${pvpId}`)
            .setLabel("⚔️ Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`pvp_decline_${pvpId}`)
            .setLabel("❌ Decline")
            .setStyle(ButtonStyle.Danger)
        );
      
      await message.reply({ embeds: [embed], components: [row] });
      logger?.info("⚔️ [pvpChallenge] Challenge created", { pvpId, userId, targetUserId, wager });
    } finally {
      client.release();
    }
    
    return { result: "challenge_created" };
  },
});

// PVP button handlers
export const pvpButtonTool = createTool({
  id: "pvp-button",
  description: "Handles PVP accept/decline buttons",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    customId: z.string(),
    interaction: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, customId, interaction } = context;
    
    const parts = customId.split("_");
    const action = parts[1];
    const pvpId = parseInt(parts[2]);
    
    logger?.info("⚔️ [pvpButton] Button clicked", { userId, action, pvpId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const pvpResult = await client.query(
        `SELECT * FROM discord_pvp WHERE id = $1 AND completed = false`,
        [pvpId]
      );
      
      if (pvpResult.rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ This PVP challenge is no longer active!");
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return { result: "pvp_inactive" };
      }
      
      const pvp = pvpResult.rows[0];
      
      if (userId !== pvp.defender_id) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ This challenge is not for you!");
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return { result: "wrong_user" };
      }
      
      if (action === "decline") {
        await client.query(
          `UPDATE discord_pvp SET completed = true WHERE id = $1`,
          [pvpId]
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription(`❌ **${username}** declined the PVP challenge!`);
        
        await interaction.update({ embeds: [embed], components: [] });
        logger?.info("⚔️ [pvpButton] Challenge declined", { pvpId, userId });
        return { result: "challenge_declined" };
      }
      
      // Battle logic
      const attackerPower = Math.floor(Math.random() * 100) + 1;
      const defenderPower = Math.floor(Math.random() * 100) + 1;
      
      const winnerId = attackerPower > defenderPower ? pvp.attacker_id : pvp.defender_id;
      const loserId = winnerId === pvp.attacker_id ? pvp.defender_id : pvp.attacker_id;
      
      await client.query(
        `UPDATE discord_pvp SET winner_id = $1, completed = true WHERE id = $2`,
        [winnerId, pvpId]
      );
      
      const runtimeContext = new RuntimeContext();
      
      // Transfer candies if there's a wager
      if (pvp.wager_candies > 0) {
        const { subtractCandyTool } = await import("./candyManager");
        await subtractCandyTool.execute({
          context: { userId: loserId, amount: pvp.wager_candies },
          runtimeContext,
          mastra,
        });
        
        await addCandyTool.execute({
          context: { userId: winnerId, amount: pvp.wager_candies, source: "pvp_win", guildId: pvp.guild_id },
          runtimeContext,
          mastra,
        });
      }
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("⚔️ PVP BATTLE COMPLETE! ⚔️")
        .setDescription(`**Battle Results:**\n\n<@${pvp.attacker_id}>: **${attackerPower}** power\n<@${pvp.defender_id}>: **${defenderPower}** power\n\n🏆 **Winner:** <@${winnerId}>!\n\n${pvp.wager_candies > 0 ? `💰 Won **${pvp.wager_candies} candies**!` : ''}`);
      
      await interaction.update({ embeds: [embed], components: [] });
      logger?.info("⚔️ [pvpButton] Battle completed", { pvpId, winnerId, wager: pvp.wager_candies });
    } finally {
      client.release();
    }
    
    return { result: "battle_completed" };
  },
});

// Daily rewards command
export const dailyRewardsCommandTool = createTool({
  id: "daily-rewards-command",
  description: "Claim daily rewards based on owned roles",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    message: z.any(),
    userRoles: z.array(z.string()),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, message, userRoles } = context;
    
    logger?.info("🎁 [dailyRewards] Command executed", { userId, guildId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const lastClaimResult = await client.query(
        `SELECT last_claimed FROM discord_daily_rewards WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
      );
      
      if (lastClaimResult.rows.length > 0) {
        const lastClaimed = new Date(lastClaimResult.rows[0].last_claimed);
        const now = new Date();
        const hoursSinceLastClaim = (now.getTime() - lastClaimed.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastClaim < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceLastClaim);
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription(`⏰ You already claimed your daily reward! Come back in **${hoursRemaining} hours**!`);
          
          await message.reply({ embeds: [embed] });
          return { result: "already_claimed" };
        }
      }
      
      // Calculate rewards based on roles
      const roleRewards: { [key: string]: { candies: number; itemChance: number } } = {
        "1427687279601778760": { candies: 1500, itemChance: 0.5 }, // Necromancer
        "1427688233138917376": { candies: 1000, itemChance: 0.3 }, // Gravekeeper
        "1424364095070666802": { candies: 500, itemChance: 0.2 },  // Pumpkin King
        "1424364070710018058": { candies: 350, itemChance: 0.15 }, // Witch
        "1424364049956737126": { candies: 250, itemChance: 0.1 },  // Vampire
      };
      
      let totalCandies = 100; // Base reward
      let itemGranted = false;
      let roleName = "None";
      
      for (const roleId of userRoles) {
        if (roleRewards[roleId]) {
          totalCandies = Math.max(totalCandies, roleRewards[roleId].candies);
          if (Math.random() < roleRewards[roleId].itemChance) {
            itemGranted = true;
          }
          roleName = roleId;
        }
      }
      
      const runtimeContext = new RuntimeContext();
      await addCandyTool.execute({
        context: { userId, amount: totalCandies, source: "daily_reward", guildId },
        runtimeContext,
        mastra,
      });
      
      if (itemGranted) {
        const itemTypes = ["Healing Potion", "Strength Elixir", "Lucky Coin", "Ghost Essence", "Pumpkin Bomb"];
        const rarities = ["common", "uncommon", "rare"];
        const selectedItem = itemTypes[Math.floor(Math.random() * itemTypes.length)];
        const selectedRarity = rarities[Math.floor(Math.random() * rarities.length)];
        
        await client.query(
          `INSERT INTO discord_items (user_id, guild_id, item_name, item_type, rarity)
           VALUES ($1, $2, $3, 'consumable', $4)`,
          [userId, guildId, selectedItem, selectedRarity]
        );
      }
      
      await client.query(
        `INSERT INTO discord_daily_rewards (user_id, guild_id, last_claimed)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET last_claimed = NOW(), guild_id = $2`,
        [userId, guildId]
      );
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🎁 DAILY REWARD CLAIMED! 🎁")
        .setDescription(`You received **${totalCandies} candies**!${itemGranted ? '\n\n🎁 **Bonus:** You also received a random item!' : ''}`);
      
      await message.reply({ embeds: [embed] });
      logger?.info("🎁 [dailyRewards] Reward claimed", { userId, candies: totalCandies, itemGranted });
    } finally {
      client.release();
    }
    
    return { result: "reward_claimed" };
  },
});

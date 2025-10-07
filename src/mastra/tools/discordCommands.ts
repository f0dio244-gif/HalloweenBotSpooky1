import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Message, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { RuntimeContext } from "@mastra/core/di";
import { addCandyTool, subtractCandyTool, getCandyBalanceTool, recordShopPurchaseTool } from "./candyManager";
import { sharedPgPool } from "../storage";

const EMBED_COLOR = 0xe67e22;

// Trick or Treat command
export const trickOrTreatTool = createTool({
  id: "trick-or-treat",
  description: "Handles the !trickortreat command - gives random candies or applies a trick punishment",
  inputSchema: z.object({
    userId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
    candiesEarned: z.number().optional(),
    isTrick: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, message } = context;
    
    logger?.info("🎃 [trickOrTreat] Command executed", { userId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    let client = await sharedPgPool.connect();
    
    try {
      const cooldownCheck = await client.query(
        "SELECT last_used FROM discord_cooldowns WHERE user_id = $1 AND command = 'trickortreat'",
        [userId]
      );
      
      if (cooldownCheck.rows.length > 0) {
        const lastUsed = new Date(cooldownCheck.rows[0].last_used);
        const now = new Date();
        const timeSinceLastUse = now.getTime() - lastUsed.getTime();
        const cooldownDuration = 3600000;
        
        if (timeSinceLastUse < cooldownDuration) {
          const remainingTime = Math.ceil((cooldownDuration - timeSinceLastUse) / 60000);
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription(`⏰ You need to wait **${remainingTime} minutes** before trick-or-treating again!`);
          
          await message.reply({ embeds: [embed] });
          logger?.info("🎃 [trickOrTreat] Cooldown active", { userId, remainingTime });
          return { result: "cooldown_active", isTrick: false };
        }
      }
    } finally {
      client.release();
    }
    
    const runtimeContext = new RuntimeContext();
    
    const isTrick = Math.random() < 0.3;
    
    if (isTrick) {
      try {
        const member = message.member as GuildMember;
        if (member && member.moderatable) {
          await member.timeout(10 * 1000, "👻 Trick or Treat - Got tricked!");
          
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("👻 **TRICK!** You've been spooked and timed out for **10 seconds** because you got tricked in Trick or Treat! 👻");
          
          await message.reply({ embeds: [embed] });
          logger?.info("🎃 [trickOrTreat] Trick applied - timeout", { userId });
          
          const cooldownClient = await sharedPgPool!.connect();
          try {
            await cooldownClient.query(
              `INSERT INTO discord_cooldowns (user_id, command, last_used)
               VALUES ($1, 'trickortreat', NOW())
               ON CONFLICT (user_id, command)
               DO UPDATE SET last_used = NOW()`,
              [userId]
            );
          } finally {
            cooldownClient.release();
          }
          
          return { result: "trick_timeout", isTrick: true };
        } else {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("👻 **TRICK!** You got spooked, but you're too powerful to timeout! 💪");
          
          await message.reply({ embeds: [embed] });
          logger?.info("🎃 [trickOrTreat] Trick attempted but user not moderatable", { userId });
          
          const cooldownClient = await sharedPgPool!.connect();
          try {
            await cooldownClient.query(
              `INSERT INTO discord_cooldowns (user_id, command, last_used)
               VALUES ($1, 'trickortreat', NOW())
               ON CONFLICT (user_id, command)
               DO UPDATE SET last_used = NOW()`,
              [userId]
            );
          } finally {
            cooldownClient.release();
          }
          
          return { result: "trick_failed", isTrick: true };
        }
      } catch (error) {
        logger?.error("❌ [trickOrTreat] Error applying timeout", { error });
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("👻 **TRICK!** Something spooky happened... 👻");
        
        await message.reply({ embeds: [embed] });
        return { result: "trick_error", isTrick: true };
      }
    } else {
      const baseCandies = Math.floor(Math.random() * 26) + 5;
      
      const { newBalance } = await addCandyTool.execute({
        context: { userId, amount: baseCandies, source: "trick_or_treat", guildId: message.guildId },
        runtimeContext,
        mastra,
      });
      
      // Get actual earned amount with both multipliers
      if (!sharedPgPool) throw new Error("Database pool not initialized");
      const multiplierClient = await sharedPgPool.connect();
      let actualEarned = baseCandies;
      let totalMultiplier = 1;
      try {
        const upgradeResult = await multiplierClient.query(
          "SELECT upgrade_level FROM discord_candy_upgrades WHERE user_id = $1",
          [userId]
        );
        const upgradeLevel = upgradeResult.rows[0]?.upgrade_level || 0;
        const upgradeMultiplier = 1 + (upgradeLevel * 0.25);
        
        const guildResult = await multiplierClient.query(
          "SELECT candy_multiplier FROM discord_bot_state WHERE guild_id = $1",
          [message.guildId]
        );
        const guildMultiplier = guildResult.rows[0]?.candy_multiplier || 1.0;
        
        totalMultiplier = upgradeMultiplier * guildMultiplier;
        actualEarned = Math.floor(baseCandies * totalMultiplier);
      } finally {
        multiplierClient.release();
      }
      
      let description = `🎃 **TREAT!** You got `;
      if (totalMultiplier > 1) {
        description += `**${baseCandies} candies** (x${totalMultiplier.toFixed(2)} = **${actualEarned} candies**)! 🍬`;
      } else {
        description += `**${actualEarned} candies**! 🍬`;
      }
      description += ` Your total: **${newBalance} candies**`;
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(description);
      
      await message.reply({ embeds: [embed] });
      
      logger?.info("🎃 [trickOrTreat] Treat given", { userId, actualEarned, newBalance });
      
      const cooldownClient = await sharedPgPool!.connect();
      try {
        await cooldownClient.query(
          `INSERT INTO discord_cooldowns (user_id, command, last_used)
           VALUES ($1, 'trickortreat', NOW())
           ON CONFLICT (user_id, command)
           DO UPDATE SET last_used = NOW()`,
          [userId]
        );
      } finally {
        cooldownClient.release();
      }
      
      return { result: "treat", candiesEarned: actualEarned, isTrick: false };
    }
  },
});

// Shop command
export const shopCommandTool = createTool({
  id: "shop-command",
  description: "Handles the !shop command - displays available roles with buttons",
  inputSchema: z.object({
    userId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, message } = context;
    
    logger?.info("🛒 [shopCommand] Command executed", { userId });
    
    const runtimeContext = new RuntimeContext();
    
    const shopItems = [
      { name: "🎃 Pumpkin Collector", cost: 250, roleId: "1424363966645403739", type: "role" },
      { name: "👻 Ghost", cost: 500, roleId: "1424364014623785041", type: "role" },
      { name: "💀 Skeleton", cost: 750, roleId: "1424364031560388638", type: "role" },
      { name: "🧛 Vampire", cost: 1000, roleId: "1424364049956737126", type: "role" },
      { name: "🧙 Witch", cost: 1500, roleId: "1424364070710018058", type: "role" },
      { name: "👑 Pumpkin King", cost: 2000, roleId: "1424364095070666802", type: "role" },
    ];
    
    // Get current upgrade level
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const dbClient = await sharedPgPool.connect();
    let upgradeLevel = 0;
    try {
      const upgradeResult = await dbClient.query(
        "SELECT upgrade_level FROM discord_candy_upgrades WHERE user_id = $1",
        [userId]
      );
      upgradeLevel = upgradeResult.rows[0]?.upgrade_level || 0;
    } finally {
      dbClient.release();
    }
    
    // Add upgrade item with escalating cost
    const upgradeCost = 500 + (upgradeLevel * 300);
    const upgradeBonus = (upgradeLevel + 1) * 25;
    shopItems.push({ 
      name: `⭐ Candy Boost Upgrade (Lv ${upgradeLevel + 1})`, 
      cost: upgradeCost, 
      roleId: "upgrade",
      type: "upgrade"
    });
    
    const { balance } = await getCandyBalanceTool.execute({
      context: { userId },
      runtimeContext,
      mastra,
    });
    
    const currentMultiplier = 1 + (upgradeLevel * 0.25);
    
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🎃 HALLOWEEN CANDY SHOP 🎃")
      .setDescription(`Your balance: **${balance} candies** 🍬\nCurrent Candy Multiplier: **x${currentMultiplier.toFixed(2)}**\n\nClick a button below to purchase!`)
      .addFields(
        shopItems.map((item, index) => ({
          name: item.name,
          value: item.type === "role" 
            ? `**${item.cost} candies** - Role` 
            : `**${item.cost} candies** - Upgrade (+${upgradeBonus}% candy earnings)`,
          inline: true,
        }))
      );
    
    const row1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        shopItems.slice(0, 3).map((item, index) =>
          new ButtonBuilder()
            .setCustomId(`shop_buy_${index}`)
            .setLabel(item.name.length > 80 ? item.name.substring(0, 77) + "..." : item.name)
            .setStyle(ButtonStyle.Primary)
        )
      );
    
    const row2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        shopItems.slice(3, 6).map((item, index) =>
          new ButtonBuilder()
            .setCustomId(`shop_buy_${index + 3}`)
            .setLabel(item.name.length > 80 ? item.name.substring(0, 77) + "..." : item.name)
            .setStyle(ButtonStyle.Primary)
        )
      );
    
    const row3 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("shop_buy_6")
          .setLabel(shopItems[6].name.length > 80 ? shopItems[6].name.substring(0, 77) + "..." : shopItems[6].name)
          .setStyle(ButtonStyle.Success)
      );
    
    await message.reply({ embeds: [embed], components: [row1, row2, row3] });
    logger?.info("🛒 [shopCommand] Displayed shop", { userId, balance, upgradeLevel });
    return { result: "shop_displayed" };
  },
});

// Shop button handler
export const shopButtonTool = createTool({
  id: "shop-button",
  description: "Handles shop button purchases",
  inputSchema: z.object({
    userId: z.string(),
    customId: z.string(),
    interaction: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, customId, interaction } = context;
    
    logger?.info("🛒 [shopButton] Button clicked", { userId, customId });
    
    const runtimeContext = new RuntimeContext();
    
    const shopItems = [
      { name: "🎃 Pumpkin Collector", cost: 250, roleId: "1424363966645403739", type: "role" },
      { name: "👻 Ghost", cost: 500, roleId: "1424364014623785041", type: "role" },
      { name: "💀 Skeleton", cost: 750, roleId: "1424364031560388638", type: "role" },
      { name: "🧛 Vampire", cost: 1000, roleId: "1424364049956737126", type: "role" },
      { name: "🧙 Witch", cost: 1500, roleId: "1424364070710018058", type: "role" },
      { name: "👑 Pumpkin King", cost: 2000, roleId: "1424364095070666802", type: "role" },
    ];
    
    // Get current upgrade level
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const dbClient = await sharedPgPool.connect();
    let upgradeLevel = 0;
    try {
      const upgradeResult = await dbClient.query(
        "SELECT upgrade_level FROM discord_candy_upgrades WHERE user_id = $1",
        [userId]
      );
      upgradeLevel = upgradeResult.rows[0]?.upgrade_level || 0;
    } finally {
      dbClient.release();
    }
    
    // Add upgrade item with escalating cost
    const upgradeCost = 500 + (upgradeLevel * 300);
    const upgradeBonus = (upgradeLevel + 1) * 25;
    shopItems.push({ 
      name: `⭐ Candy Boost Upgrade (Lv ${upgradeLevel + 1})`, 
      cost: upgradeCost, 
      roleId: "upgrade",
      type: "upgrade"
    });
    
    const itemIndex = parseInt(customId.split("_")[2]);
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= shopItems.length) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ Invalid item!");
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return { result: "invalid_item" };
    }
    
    const item = shopItems[itemIndex];
    const { balance } = await getCandyBalanceTool.execute({
      context: { userId },
      runtimeContext,
      mastra,
    });
    
    if (balance < item.cost) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(`❌ You don't have enough candies! You need **${item.cost}** but only have **${balance}**.`);
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return { result: "insufficient_funds" };
    }
    
    const { success, newBalance } = await subtractCandyTool.execute({
      context: { userId, amount: item.cost },
      runtimeContext,
      mastra,
    });
    
    if (!success) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ Purchase failed! Please try again.");
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return { result: "purchase_failed" };
    }
    
    // Handle upgrade purchase
    if (item.type === "upgrade") {
      const upgradeClient = await sharedPgPool!.connect();
      try {
        await upgradeClient.query(
          `INSERT INTO discord_candy_upgrades (user_id, upgrade_level)
           VALUES ($1, 1)
           ON CONFLICT (user_id)
           DO UPDATE SET upgrade_level = discord_candy_upgrades.upgrade_level + 1`,
          [userId]
        );
        
        const newMultiplier = 1 + ((upgradeLevel + 1) * 0.25);
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription(`✅ **Upgrade purchased!** 🌟\nYour candy multiplier is now **x${newMultiplier.toFixed(2)}**!\nYou now earn **${upgradeBonus}% more candies** from all sources!\nRemaining balance: **${newBalance} candies**`);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        logger?.info("🛒 [shopButton] Upgrade purchased", { userId, newLevel: upgradeLevel + 1, newBalance });
      } finally {
        upgradeClient.release();
      }
    } else {
      // Handle role purchase
      await recordShopPurchaseTool.execute({
        context: { userId, roleId: item.roleId, cost: item.cost },
        runtimeContext,
        mastra,
      });
      
      try {
        const member = interaction.member as GuildMember;
        const role = interaction.guild?.roles.cache.get(item.roleId);
        
        if (role && member) {
          await member.roles.add(role);
          
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription(`✅ **Purchase successful!** You received the **${item.name}** role! 🎉\nRemaining balance: **${newBalance} candies**`);
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
          logger?.info("🛒 [shopButton] Purchase completed with role", { userId, item: item.name, newBalance });
        } else {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription(`✅ **Purchase successful!** You bought **${item.name}**! 🎉\n(Role not found on server, but purchase recorded)\nRemaining balance: **${newBalance} candies**`);
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
          logger?.warn("🛒 [shopButton] Role not found", { roleId: item.roleId });
        }
      } catch (error) {
        logger?.error("❌ [shopButton] Error assigning role", { error });
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription(`✅ **Purchase successful!** You bought **${item.name}**! 🎉\nRemaining balance: **${newBalance} candies**`);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
    
    return { result: "purchase_successful" };
  },
});

// Pumpkin Inbound command (spawn 5 pumpkins)
export const pumpkinInboundCommandTool = createTool({
  id: "pumpkin-inbound-command",
  description: "Handles the !pumpkininbound command - spawns 5 pumpkins in random channels (admin only)",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    guildId: z.string(),
    message: z.any(),
    client: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, guildId, message, client } = context;
    
    logger?.info("🎃 [pumpkinInbound] Command executed", { userId, guildId });
    
    // Check if user is admin
    const member = message.member;
    if (!member?.permissions.has("Administrator")) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("🚫 **You need administrator permissions to use this command!**");
      
      await message.reply({ embeds: [embed] });
      logger?.info("🎃 [pumpkinInbound] Permission denied", { userId });
      return { result: "permission_denied" };
    }
    
    const REQUIRED_ROLE_ID = "1194335353381867541";
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ **Could not find guild!**");
      
      await message.reply({ embeds: [embed] });
      return { result: "guild_not_found" };
    }
    
    // Get all valid channels
    const textChannels: any[] = [];
    const RESTRICTED_ROLE_ID = "1392489027327885455";
    guild.channels.cache.forEach((channel: any) => {
      if (channel.isTextBased() && !channel.isDMBased()) {
        const role = guild.roles.cache.get(REQUIRED_ROLE_ID);
        if (role && channel.permissionsFor(role)?.has("SendMessages")) {
          // Exclude channels where the restricted role can send messages
          const restrictedRole = guild.roles.cache.get(RESTRICTED_ROLE_ID);
          if (restrictedRole && channel.permissionsFor(restrictedRole)?.has("SendMessages")) {
            return; // Skip this channel
          }
          textChannels.push(channel);
        }
      }
    });
    
    if (textChannels.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ **No valid channels found!**");
      
      await message.reply({ embeds: [embed] });
      return { result: "no_channels" };
    }
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    
    const confirmEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(`🎃 **Spawning 5 pumpkins!** Watch out, they'll appear one by one!`);
    
    await message.reply({ embeds: [confirmEmbed] });
    
    // Spawn exactly 5 pumpkins sequentially (channels can repeat if needed)
    const spawnCount = 5;
    let spawnedCount = 0;
    
    for (let i = 0; i < spawnCount; i++) {
      // Wait for any active pumpkin to be cleared
      let attempts = 0;
      while (attempts < 60) { // Wait up to 30 seconds
        const dbClient = await sharedPgPool.connect();
        try {
          const stateCheck = await dbClient.query(
            "SELECT active FROM discord_pumpkin_state WHERE id = 1"
          );
          if (!stateCheck.rows[0]?.active) break;
        } finally {
          dbClient.release();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      const randomChannel = textChannels[Math.floor(Math.random() * textChannels.length)];
      const candyAmount = Math.floor(Math.random() * 21) + 10; // 10-30 candies
      
      const spawnEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setDescription(`🎃 **A wild pumpkin appeared!** Type \`!grab\` to catch it and win **${candyAmount} candies**! 🍬`);
      
      try {
        const spawnMessage = await randomChannel.send({ embeds: [spawnEmbed] });
        
        const dbClient = await sharedPgPool.connect();
        try {
          await dbClient.query(
            `UPDATE discord_pumpkin_state 
             SET active = true, spawn_requested = false, channel_id = $1, message_id = $2, candy_amount = $3, spawned_at = NOW()
             WHERE id = 1`,
            [randomChannel.id, spawnMessage.id, candyAmount]
          );
        } finally {
          dbClient.release();
        }
        
        spawnedCount++;
        logger?.info("🎃 [pumpkinInbound] Pumpkin spawned", { channelId: randomChannel.id, candyAmount });
        
        // Auto-despawn after 30 seconds
        setTimeout(async () => {
          if (!sharedPgPool) return;
          const despawnClient = await sharedPgPool.connect();
          
          try {
            const stillActiveCheck = await despawnClient.query(
              "SELECT * FROM discord_pumpkin_state WHERE id = 1 AND active = true AND message_id = $1",
              [spawnMessage.id]
            );
            
            if (stillActiveCheck.rows.length > 0) {
              const despawnEmbed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription("💨 **Too slow! The pumpkin rolled away...**");
              
              await spawnMessage.edit({ embeds: [despawnEmbed] });
              await despawnClient.query(
                "UPDATE discord_pumpkin_state SET active = false WHERE id = 1"
              );
              logger?.info("🎃 [pumpkinInbound] Pumpkin despawned (timeout)");
            }
          } catch (error) {
            logger?.error("❌ [pumpkinInbound] Error despawning pumpkin", { error });
          } finally {
            despawnClient.release();
          }
        }, 30000);
        
      } catch (error) {
        logger?.error("❌ [pumpkinInbound] Error spawning pumpkin", { error, channelId: randomChannel.id });
      }
      
      // Small delay before next spawn
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    logger?.info("🎃 [pumpkinInbound] All pumpkins spawned", { spawnedCount });
    
    return { result: "success" };
  },
});

// Spawn Pumpkin command (spawn in current channel)
export const spawnPumpkinCommandTool = createTool({
  id: "spawn-pumpkin-command",
  description: "Handles the !spumpkin command - spawns pumpkins in the current channel",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    guildId: z.string(),
    channelId: z.string(),
    message: z.any(),
    count: z.number().default(1),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, guildId, channelId, message, count } = context;
    
    const spawnCount = Math.min(Math.max(count, 1), 10); // Limit to 1-10 pumpkins
    logger?.info("🎃 [spawnPumpkin] Command executed", { userId, channelId, count: spawnCount });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    
    if (spawnCount > 1) {
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setDescription(`🎃 **Spawning ${spawnCount} pumpkins!** They'll appear one by one as each is claimed!`);
      
      await message.reply({ embeds: [confirmEmbed] });
    }
    
    // Spawn pumpkins sequentially
    for (let i = 0; i < spawnCount; i++) {
      // Wait for any active pumpkin to be cleared
      let attempts = 0;
      while (attempts < 60) {
        const checkClient = await sharedPgPool.connect();
        try {
          const stateCheck = await checkClient.query(
            "SELECT active FROM discord_pumpkin_state WHERE id = 1"
          );
          if (!stateCheck.rows[0]?.active) break;
        } finally {
          checkClient.release();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      const client = await sharedPgPool.connect();
      try {
        // Random candy amount between 10-30
        const candyAmount = Math.floor(Math.random() * 21) + 10;
        
        const spawnEmbed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setDescription(`🎃 **A pumpkin has appeared!** Type \`!grab\` to catch it and win **${candyAmount} candies**! 🍬`);
        
        const spawnMessage = await message.channel.send({ embeds: [spawnEmbed] });
        
        // Update pumpkin state in database
        await client.query(
          `UPDATE discord_pumpkin_state 
           SET active = true, spawn_requested = false, channel_id = $1, message_id = $2, candy_amount = $3, spawned_at = NOW()
           WHERE id = 1`,
          [channelId, spawnMessage.id, candyAmount]
        );
        
        logger?.info("🎃 [spawnPumpkin] Pumpkin spawned", { channelId, candyAmount, number: i + 1, total: spawnCount });
        
        // Auto-despawn after 30 seconds
        setTimeout(async () => {
          if (!sharedPgPool) return;
          const despawnClient = await sharedPgPool.connect();
          
          try {
            const stillActiveCheck = await despawnClient.query(
              "SELECT * FROM discord_pumpkin_state WHERE id = 1 AND active = true AND message_id = $1",
              [spawnMessage.id]
            );
            
            if (stillActiveCheck.rows.length > 0) {
              const despawnEmbed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription("💨 **Too slow! The pumpkin rolled away...**");
              
              await spawnMessage.edit({ embeds: [despawnEmbed] });
              await despawnClient.query(
                "UPDATE discord_pumpkin_state SET active = false WHERE id = 1"
              );
              logger?.info("🎃 [spawnPumpkin] Pumpkin despawned (timeout)");
            }
          } catch (error) {
            logger?.error("❌ [spawnPumpkin] Error despawning pumpkin", { error });
          } finally {
            despawnClient.release();
          }
        }, 30000);
      } finally {
        client.release();
      }
    }
    
    return { result: "success" };
  },
});

// Grab command (for pumpkin hunt)
export const grabCommandTool = createTool({
  id: "grab-command",
  description: "Handles the !grab command - allows users to grab a spawned pumpkin",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    channelId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
    candiesEarned: z.number().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, channelId, message } = context;
    
    logger?.info("🎃 [grabCommand] Attempting to grab pumpkin", { userId, channelId });
    
    const runtimeContext = new RuntimeContext();
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    
    try {
      // Start transaction and lock the row to prevent race conditions
      await client.query("BEGIN");
      
      const pumpkinResult = await client.query(
        "SELECT * FROM discord_pumpkin_state WHERE id = 1 FOR UPDATE"
      );
      
      if (pumpkinResult.rows.length === 0 || !pumpkinResult.rows[0].active) {
        await client.query("ROLLBACK");
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("💨 **No pumpkin to grab!** Keep an eye out for the next one!");
        
        await message.reply({ embeds: [embed] });
        logger?.info("🎃 [grabCommand] No active pumpkin", { userId });
        return { result: "no_pumpkin" };
      }
      
      const pumpkin = pumpkinResult.rows[0];
      
      if (pumpkin.channel_id !== channelId) {
        await client.query("ROLLBACK");
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("💨 **The pumpkin is not in this channel!**");
        
        await message.reply({ embeds: [embed] });
        logger?.info("🎃 [grabCommand] Pumpkin in different channel", { userId, pumpkinChannel: pumpkin.channel_id });
        return { result: "wrong_channel" };
      }
      
      // Mark pumpkin as inactive BEFORE awarding candy
      await client.query(
        "UPDATE discord_pumpkin_state SET active = false WHERE id = 1"
      );
      
      // Commit the transaction to release the lock
      await client.query("COMMIT");
      
      const baseCandies = pumpkin.candy_amount;
      const { newBalance } = await addCandyTool.execute({
        context: { userId, amount: baseCandies, source: "pumpkin_grab", guildId: message.guildId },
        runtimeContext,
        mastra,
      });
      
      // Get actual earned amount with both multipliers
      if (!sharedPgPool) throw new Error("Database pool not initialized");
      const multiplierClient = await sharedPgPool.connect();
      let actualEarned = baseCandies;
      let totalMultiplier = 1;
      try {
        const upgradeResult = await multiplierClient.query(
          "SELECT upgrade_level FROM discord_candy_upgrades WHERE user_id = $1",
          [userId]
        );
        const upgradeLevel = upgradeResult.rows[0]?.upgrade_level || 0;
        const upgradeMultiplier = 1 + (upgradeLevel * 0.25);
        
        const guildResult = await multiplierClient.query(
          "SELECT candy_multiplier FROM discord_bot_state WHERE guild_id = $1",
          [message.guildId]
        );
        const guildMultiplier = guildResult.rows[0]?.candy_multiplier || 1.0;
        
        totalMultiplier = upgradeMultiplier * guildMultiplier;
        actualEarned = Math.floor(baseCandies * totalMultiplier);
      } finally {
        multiplierClient.release();
      }
      
      let description = `🎃 **Congratulations ${username}!** You caught the pumpkin and got `;
      if (totalMultiplier > 1) {
        description += `**${baseCandies} candies** (x${totalMultiplier.toFixed(2)} = **${actualEarned} candies**)! 🍬`;
      } else {
        description += `**${actualEarned} candies**! 🍬`;
      }
      description += `\nYour total: **${newBalance} candies**`;
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(description);
      
      await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      
      logger?.info("🎃 [grabCommand] Pumpkin grabbed successfully", { userId, actualEarned, newBalance });
      return { result: "success", candiesEarned: actualEarned };
    } catch (error) {
      await client.query("ROLLBACK");
      logger?.error("❌ [grabCommand] Error grabbing pumpkin", { error });
      throw error;
    } finally {
      client.release();
    }
  },
});

import { Mastra } from "@mastra/core";
import { registerDiscordTrigger } from "../../triggers/discordTriggers";
import { trickOrTreatTool, shopCommandTool, grabCommandTool, shopButtonTool, pumpkinInboundCommandTool, spawnPumpkinCommandTool } from "../tools/discordCommands";
import { addCandyTool } from "../tools/candyManager";
import { RuntimeContext } from "@mastra/core/di";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { sharedPgPool } from "../storage";
import { initializeDatabase } from "../db/init";

export async function initializeDiscordBot(mastra: Mastra) {
  const logger = mastra.getLogger();
  
  logger?.info("🎃 [DiscordBot] Initializing Halloween Discord Bot...");
  
  // Initialize database tables
  try {
    await initializeDatabase();
    logger?.info("🎃 [DiscordBot] Database initialized");
  } catch (error) {
    logger?.error("❌ [DiscordBot] Failed to initialize database", { error });
  }

  const client = await registerDiscordTrigger({
    mastra,
    onMessage: async (mastra, triggerInfo) => {
      const { userId, username, channelId, guildId, content } = triggerInfo.params;
      const message = triggerInfo.payload;
      
      const runtimeContext = new RuntimeContext();
      
      // Handle commands
      if (content.startsWith("!")) {
        const args = content.slice(1).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();
        
        // Check if bot is enabled for this guild (except for enable/disable commands)
        if (command !== "enable" && command !== "disable") {
          if (!sharedPgPool) return;
          const stateClient = await sharedPgPool.connect();
          try {
            const stateResult = await stateClient.query(
              "SELECT enabled FROM discord_bot_state WHERE guild_id = $1",
              [guildId]
            );
            const isEnabled = stateResult.rows[0]?.enabled !== false;
            
            if (!isEnabled) {
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription("🚫 The bot is currently disabled. An administrator can enable it with `!enable`.");
              
              await message.reply({ embeds: [embed] });
              return;
            }
          } finally {
            stateClient.release();
          }
        }
        
        if (command === "trickortreat") {
          await trickOrTreatTool.execute({
            context: { userId, message },
            runtimeContext,
            mastra,
          });
          return;
        }
        
        if (command === "shop") {
          await shopCommandTool.execute({
            context: { userId, message },
            runtimeContext,
            mastra,
          });
          return;
        }
        
        if (command === "grab") {
          await grabCommandTool.execute({
            context: { userId, username, channelId, message },
            runtimeContext,
            mastra,
          });
          return;
        }
        
        if (command === "candies") {
          if (!sharedPgPool) return;
          const client = await sharedPgPool.connect();
          try {
            const result = await client.query(
              "SELECT candy_balance FROM discord_candy_balances WHERE user_id = $1",
              [userId]
            );
            const balance = result.rows[0]?.candy_balance || 0;
            
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription(`🍬 You have **${balance} candies**!`);
            
            await message.reply({ embeds: [embed] });
            logger?.info("🍬 [DiscordBot] Candies command", { userId, balance });
          } finally {
            client.release();
          }
          return;
        }
        
        if (command === "history") {
          if (!sharedPgPool) return;
          const client = await sharedPgPool.connect();
          try {
            const result = await client.query(
              "SELECT amount, source, earned_at FROM discord_candy_history WHERE user_id = $1 ORDER BY earned_at DESC LIMIT 10",
              [userId]
            );
            
            if (result.rows.length === 0) {
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription("📜 You haven't earned any candies yet! Try `!trickortreat` or chat to earn candies!");
              
              await message.reply({ embeds: [embed] });
            } else {
              let historyText = "📜 **Your Last Candy Earnings:**\n\n";
              result.rows.forEach((row: any) => {
                const date = new Date(row.earned_at);
                const timeAgo = Math.floor((Date.now() - date.getTime()) / 60000);
                const timeStr = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;
                historyText += `🍬 **+${row.amount}** candies from **${row.source}** (${timeStr})\n`;
              });
              
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription(historyText);
              
              await message.reply({ embeds: [embed] });
            }
            logger?.info("📜 [DiscordBot] History command", { userId });
          } finally {
            client.release();
          }
          return;
        }
        
        if (command === "enable") {
          const member = message.member as any;
          if (!member?.permissions?.has("Administrator")) {
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("❌ Only administrators can enable the bot!");
            
            await message.reply({ embeds: [embed] });
            return;
          }
          
          if (!sharedPgPool) return;
          const client = await sharedPgPool.connect();
          try {
            await client.query(
              `INSERT INTO discord_bot_state (guild_id, enabled)
               VALUES ($1, true)
               ON CONFLICT (guild_id)
               DO UPDATE SET enabled = true`,
              [guildId]
            );
            
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("✅ Bot has been enabled! All commands are now available.");
            
            await message.reply({ embeds: [embed] });
            logger?.info("✅ [DiscordBot] Bot enabled", { guildId, userId });
          } finally {
            client.release();
          }
          return;
        }
        
        if (command === "disable") {
          const member = message.member as any;
          if (!member?.permissions?.has("Administrator")) {
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("❌ Only administrators can disable the bot!");
            
            await message.reply({ embeds: [embed] });
            return;
          }
          
          if (!sharedPgPool) return;
          const client = await sharedPgPool.connect();
          try {
            await client.query(
              `INSERT INTO discord_bot_state (guild_id, enabled)
               VALUES ($1, false)
               ON CONFLICT (guild_id)
               DO UPDATE SET enabled = false`,
              [guildId]
            );
            
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("🚫 Bot has been disabled. Use `!enable` to re-enable it.");
            
            await message.reply({ embeds: [embed] });
            logger?.info("🚫 [DiscordBot] Bot disabled", { guildId, userId });
          } finally {
            client.release();
          }
          return;
        }
        
        if (command === "pumpkininbound") {
          await pumpkinInboundCommandTool.execute({
            context: { userId, username, guildId, message, client },
            runtimeContext,
            mastra,
          });
          return;
        }
        
        if (command === "spumpkin") {
          await spawnPumpkinCommandTool.execute({
            context: { userId, username, guildId, channelId, message },
            runtimeContext,
            mastra,
          });
          return;
        }
        
        if (command === "commands") {
          const embed = new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("🎃 AVAILABLE COMMANDS 🎃")
            .setDescription("Here are all the commands you can use:")
            .addFields(
              { name: "!trickortreat", value: "Get random candies or a trick (1 hour cooldown)", inline: false },
              { name: "!grab", value: "Grab a spawned pumpkin to win candies", inline: false },
              { name: "!candies", value: "Check your candy balance", inline: false },
              { name: "!history", value: "View your last 10 candy earnings", inline: false },
              { name: "!shop", value: "Open the candy shop to buy roles and upgrades", inline: false },
              { name: "!leaderboard", value: "View the top 10 candy collectors", inline: false },
              { name: "!commands", value: "Show this command list", inline: false },
              { name: "\n**ADMIN COMMANDS**", value: "\u200b", inline: false },
              { name: "!enable", value: "Enable the bot (admin only)", inline: false },
              { name: "!disable", value: "Disable the bot (admin only)", inline: false },
              { name: "!pumpkininbound", value: "Spawn 5 pumpkins in random channels (admin only)", inline: false },
              { name: "!spumpkin", value: "Spawn a pumpkin in current channel", inline: false },
              { name: "!candymodifier <±%>", value: "Adjust candy drop rates (e.g., !candymodifier 25% or !candymodifier -25%) (admin only)", inline: false }
            );
          
          await message.reply({ embeds: [embed] });
          logger?.info("📜 [DiscordBot] Commands list displayed", { userId });
          return;
        }
        
        if (command === "leaderboard") {
          if (!sharedPgPool) return;
          const client = await sharedPgPool.connect();
          try {
            const result = await client.query(
              "SELECT user_id, candy_balance FROM discord_candy_balances ORDER BY candy_balance DESC LIMIT 10"
            );
            
            if (result.rows.length === 0) {
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription("🏆 **No one has earned candies yet!** Be the first!");
              
              await message.reply({ embeds: [embed] });
            } else {
              let leaderboardText = "🏆 **TOP CANDY COLLECTORS** 🏆\n\n";
              result.rows.forEach((row: any, index: number) => {
                const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                leaderboardText += `${medal} <@${row.user_id}>: **${row.candy_balance} candies** 🍬\n`;
              });
              
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription(leaderboardText);
              
              await message.reply({ embeds: [embed] });
            }
            logger?.info("🏆 [DiscordBot] Leaderboard displayed", { userId });
          } finally {
            client.release();
          }
          return;
        }
        
        if (command === "candymodifier") {
          const member = message.member as any;
          if (!member?.permissions?.has("Administrator")) {
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("❌ Only administrators can modify candy drop rates!");
            
            await message.reply({ embeds: [embed] });
            return;
          }
          
          if (args.length === 0) {
            if (!sharedPgPool) return;
            const client = await sharedPgPool.connect();
            try {
              const result = await client.query(
                "SELECT candy_multiplier FROM discord_bot_state WHERE guild_id = $1",
                [guildId]
              );
              const multiplier = result.rows[0]?.candy_multiplier || 1.0;
              const percentChange = (multiplier - 1) * 100;
              const percentChangeStr = percentChange.toFixed(0);
              
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription(`📊 **Current candy modifier:** ${percentChange > 0 ? '+' : ''}${percentChangeStr}% (${multiplier}x)\n\nUsage: \`!candymodifier <±%>\`\nExample: \`!candymodifier 25%\` or \`!candymodifier -25%\``);
              
              await message.reply({ embeds: [embed] });
            } finally {
              client.release();
            }
            return;
          }
          
          const modifierArg = args[0];
          const match = modifierArg.match(/^([+-]?)(\d+(?:\.\d+)?)%?$/);
          
          if (!match) {
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("❌ Invalid format! Use: `!candymodifier <±%>` (e.g., `!candymodifier 25%` or `!candymodifier -25%`)");
            
            await message.reply({ embeds: [embed] });
            return;
          }
          
          const sign = match[1] || '+';
          const percentValue = parseFloat(match[2]);
          
          // Validate the number
          if (isNaN(percentValue) || !isFinite(percentValue)) {
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription("❌ Invalid number! Please enter a valid percentage.");
            
            await message.reply({ embeds: [embed] });
            return;
          }
          
          const change = sign === '-' ? -percentValue : percentValue;
          
          if (!sharedPgPool) return;
          const client = await sharedPgPool.connect();
          try {
            const result = await client.query(
              "SELECT candy_multiplier FROM discord_bot_state WHERE guild_id = $1",
              [guildId]
            );
            let currentMultiplier = result.rows[0]?.candy_multiplier || 1.0;
            
            // Validate current multiplier (fix if it's NaN)
            if (isNaN(currentMultiplier) || !isFinite(currentMultiplier)) {
              currentMultiplier = 1.0;
            }
            
            // Calculate new multiplier (set based on percentage)
            let newMultiplier = 1 + (change / 100);
            
            // Ensure multiplier stays within reasonable bounds (0.1x to 10x)
            newMultiplier = Math.max(0.1, Math.min(10.0, newMultiplier));
            
            // Final validation
            if (isNaN(newMultiplier) || !isFinite(newMultiplier)) {
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setDescription("❌ Error calculating multiplier! Resetting to 1.0x.");
              
              await message.reply({ embeds: [embed] });
              newMultiplier = 1.0;
            }
            
            await client.query(
              `INSERT INTO discord_bot_state (guild_id, candy_multiplier, enabled)
               VALUES ($1, $2, true)
               ON CONFLICT (guild_id)
               DO UPDATE SET candy_multiplier = $2`,
              [guildId, newMultiplier]
            );
            
            const percentDisplay = (newMultiplier - 1) * 100;
            const percentDisplayStr = percentDisplay.toFixed(1);
            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setDescription(`✅ **Candy modifier updated for everyone in this server!**\n\nNew modifier: ${percentDisplay > 0 ? '+' : ''}${percentDisplayStr}% (${newMultiplier.toFixed(2)}x)\nAll candy drops are now multiplied by ${newMultiplier.toFixed(2)}!`);
            
            await message.reply({ embeds: [embed] });
            logger?.info("📊 [DiscordBot] Candy modifier updated", { guildId, userId, newMultiplier, change });
          } finally {
            client.release();
          }
          return;
        }
      }
      
      // Passive candy earning (7% chance) - only if bot is enabled
      if (!sharedPgPool) return;
      const passiveStateClient = await sharedPgPool.connect();
      let passiveEnabled = true;
      try {
        const stateResult = await passiveStateClient.query(
          "SELECT enabled FROM discord_bot_state WHERE guild_id = $1",
          [guildId]
        );
        passiveEnabled = stateResult.rows[0]?.enabled !== false;
      } finally {
        passiveStateClient.release();
      }
      
      if (passiveEnabled) {
        const shouldEarnCandy = Math.random() < 0.07;
        
        if (shouldEarnCandy) {
          // Random candy amount between 10-20
          let baseCandies = Math.floor(Math.random() * 11) + 10;
          let isGhostEncounter = false;
          let isHauntedFind = false;
          
          // 5% chance for a special ghost encounter (3x candies!)
          const ghostChance = Math.random();
          if (ghostChance < 0.05) {
            baseCandies *= 3;
            isGhostEncounter = true;
          }
          // 15% chance for a haunted candy find (1.5x candies)
          else if (ghostChance < 0.20) {
            baseCandies = Math.floor(baseCandies * 1.5);
            isHauntedFind = true;
          }
          
          const { newBalance } = await addCandyTool.execute({
            context: { userId, amount: baseCandies, source: isGhostEncounter ? "ghost_encounter" : (isHauntedFind ? "haunted_find" : "passive_chat"), guildId },
            runtimeContext,
            mastra,
          });
          
          // Get both multipliers to show actual amount earned
          if (!sharedPgPool) return;
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
              [guildId]
            );
            const guildMultiplier = guildResult.rows[0]?.candy_multiplier || 1.0;
            
            totalMultiplier = upgradeMultiplier * guildMultiplier;
            actualEarned = Math.floor(baseCandies * totalMultiplier);
          } finally {
            multiplierClient.release();
          }
          
          // Helper function to format candy message
          const formatCandyMessage = (baseMsg: string) => {
            if (totalMultiplier > 1) {
              return baseMsg.replace(/\*\*(\d+) candies\*\*/g, `**$1 candies** (x${totalMultiplier.toFixed(2)} = **${actualEarned} candies**)`);
            }
            return baseMsg;
          };
          
          // Halloween-themed random messages
          const spookyMessages = [
            `🍬 You found **${baseCandies} candies** hidden in the shadows! Your total: **${newBalance} candies**`,
            `🎃 A friendly jack-o'-lantern left you **${baseCandies} candies**! Your total: **${newBalance} candies**`,
            `🕷️ A spider dropped **${baseCandies} candies** from its web! Your total: **${newBalance} candies**`,
            `🦇 A bat flew by and dropped **${baseCandies} candies**! Your total: **${newBalance} candies**`,
            `🕸️ You found **${baseCandies} candies** stuck in a spooky web! Your total: **${newBalance} candies**`,
            `👻 A friendly ghost gifted you **${baseCandies} candies**! Your total: **${newBalance} candies**`,
            `🌙 Under the moonlight, you discovered **${baseCandies} candies**! Your total: **${newBalance} candies**`,
            `⚰️ You found **${baseCandies} candies** in an old coffin! Your total: **${newBalance} candies**`,
            `🧙 A witch's broom swept **${baseCandies} candies** your way! Your total: **${newBalance} candies**`,
            `💀 You found **${baseCandies} candies** in a skeleton's pocket! Your total: **${newBalance} candies**`
          ];
          
          let description: string;
          let embedColor: number;
          
          if (isGhostEncounter) {
            description = `👻✨ **GHOST ENCOUNTER!** ✨👻\n\nA friendly ghost appeared and showered you with `;
            if (totalMultiplier > 1) {
              description += `**${baseCandies} candies** (x${totalMultiplier.toFixed(2)} = **${actualEarned} candies**) (3x bonus)!`;
            } else {
              description += `**${actualEarned} candies** (3x bonus)!`;
            }
            description += `\nYour total: **${newBalance} candies**`;
            embedColor = 0x9b59b6; // Purple for special ghost event
          } else if (isHauntedFind) {
            description = `🌟 **HAUNTED TREASURE!** 🌟\n\nYou found a haunted candy stash with `;
            if (totalMultiplier > 1) {
              description += `**${baseCandies} candies** (x${totalMultiplier.toFixed(2)} = **${actualEarned} candies**) (1.5x bonus)!`;
            } else {
              description += `**${actualEarned} candies** (1.5x bonus)!`;
            }
            description += `\nYour total: **${newBalance} candies**`;
            embedColor = 0xf39c12; // Golden orange for haunted find
          } else {
            description = formatCandyMessage(spookyMessages[Math.floor(Math.random() * spookyMessages.length)]);
            embedColor = 0xe67e22; // Orange for normal finds
          }
          
          const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setDescription(description);
          
          // Send as silent notification (no ping!)
          await message.reply({ 
            embeds: [embed],
            flags: [MessageFlags.SuppressNotifications]
          });
          
          logger?.info("🍬 [DiscordBot] Passive candy earned", { 
            userId, 
            username, 
            actualEarned, 
            newBalance,
            isGhostEncounter,
            isHauntedFind
          });
        }
      }
    },
    onButton: async (mastra, triggerInfo) => {
      const { userId, customId, guildId } = triggerInfo.params;
      const interaction = triggerInfo.payload;
      
      // Check if bot is enabled for this guild
      if (!sharedPgPool) return;
      const buttonStateClient = await sharedPgPool.connect();
      try {
        const stateResult = await buttonStateClient.query(
          "SELECT enabled FROM discord_bot_state WHERE guild_id = $1",
          [guildId]
        );
        const isEnabled = stateResult.rows[0]?.enabled !== false;
        
        if (!isEnabled) {
          const embed = new EmbedBuilder()
            .setColor(0xe67e22)
            .setDescription("🚫 The bot is currently disabled.");
          
          if ('reply' in interaction) {
            await interaction.reply({ embeds: [embed], ephemeral: true });
          }
          return;
        }
      } finally {
        buttonStateClient.release();
      }
      
      const runtimeContext = new RuntimeContext();
      
      // Handle shop button clicks
      if (customId.startsWith("shop_buy_")) {
        await shopButtonTool.execute({
          context: { userId, customId, interaction },
          runtimeContext,
          mastra,
        });
      }
    },
  });

  // Auto-spawn pumpkins every 1-5 minutes
  const spawnPumpkinAutomatically = async () => {
    if (!sharedPgPool) return;
    
    const dbClient = await sharedPgPool.connect();
    try {
      // Check if it's time to spawn and lock the row
      await dbClient.query("BEGIN");
      const result = await dbClient.query(
        "SELECT * FROM discord_pumpkin_state WHERE id = 1 FOR UPDATE"
      );
      
      const now = new Date();
      const state = result.rows[0];
      
      // Skip if pumpkin is already active
      if (state?.active) {
        await dbClient.query("COMMIT");
        return;
      }
      
      // Check if it's time to spawn (if next_spawn_at is set and has passed)
      const nextSpawnAt = state?.next_spawn_at ? new Date(state.next_spawn_at) : null;
      if (nextSpawnAt && now < nextSpawnAt) {
        await dbClient.query("COMMIT");
        return;
      }
      
      // Check if bot is enabled for any guild before spawning
      const allStatesResult = await dbClient.query(
        "SELECT guild_id, enabled FROM discord_bot_state"
      );
      const stateMap = new Map(allStatesResult.rows.map((r: any) => [r.guild_id, r.enabled]));
      
      // Check if at least one guild is enabled (or has no state = default enabled)
      const hasEnabledGuild = Array.from(client.guilds.cache.keys()).some(guildId => {
        const state = stateMap.get(guildId);
        return state === undefined || state === true; // Enabled if no state or explicitly enabled
      });
      
      if (!hasEnabledGuild) {
        logger?.info("🎃 [DiscordBot] Pumpkin spawn skipped - all guilds disabled");
        // Schedule next check in 1 minute
        const nextSpawn = new Date(now.getTime() + 60000);
        await dbClient.query(
          "UPDATE discord_pumpkin_state SET next_spawn_at = $1 WHERE id = 1",
          [nextSpawn]
        );
        await dbClient.query("COMMIT");
        return;
      }
      
      // Get all text channels from all guilds where regular users can participate
      const textChannels: any[] = [];
      
      client.guilds.cache.forEach((guild) => {
        guild.channels.cache.forEach((channel) => {
          if (channel.isTextBased() && !channel.isDMBased()) {
            // Check if the bot can send messages
            const botMember = guild.members.cache.get(client.user?.id || '');
            if (!botMember || !channel.permissionsFor(botMember)?.has("SendMessages")) {
              return; // Skip if bot can't send
            }
            
            // Check if @everyone role can send messages (so regular users can grab)
            const everyoneRole = guild.roles.everyone;
            if (everyoneRole && channel.permissionsFor(everyoneRole)?.has("SendMessages")) {
              // Exclude channels where the restricted role can send messages
              const RESTRICTED_ROLE_ID = "1392489027327885455";
              const restrictedRole = guild.roles.cache.get(RESTRICTED_ROLE_ID);
              if (restrictedRole && channel.permissionsFor(restrictedRole)?.has("SendMessages")) {
                return; // Skip this channel
              }
              textChannels.push(channel);
            }
          }
        });
      });
      
      if (textChannels.length > 0) {
        // Select random channel
        const randomChannel = textChannels[Math.floor(Math.random() * textChannels.length)];
        
        // Random candy amount between 10-30
        const candyAmount = Math.floor(Math.random() * 21) + 10;
        
        // Send pumpkin spawn message
        const spawnEmbed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setDescription(`👀 **A wild pumpkin has appeared in <#${randomChannel.id}>!** Type \`!grab\` fast to catch it and win **${candyAmount} candies**! 🎃`);
        
        const spawnMessage = await randomChannel.send({ embeds: [spawnEmbed] });
        
        // Schedule next spawn in 1-5 minutes (60000-300000 milliseconds)
        const nextSpawnDelay = Math.floor(Math.random() * 240000) + 60000;
        const nextSpawn = new Date(now.getTime() + nextSpawnDelay);
        
        // Update pumpkin state
        await dbClient.query(
          `UPDATE discord_pumpkin_state 
           SET active = true, spawn_requested = false, channel_id = $1, message_id = $2, candy_amount = $3, spawned_at = NOW(), next_spawn_at = $4
           WHERE id = 1`,
          [randomChannel.id, spawnMessage.id, candyAmount, nextSpawn]
        );
        
        await dbClient.query("COMMIT");
        
        logger?.info("🎃 [DiscordBot] Pumpkin auto-spawned", {
          channelId: randomChannel.id,
          candyAmount,
          nextSpawnAt: nextSpawn,
        });
        
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
              logger?.info("🎃 [DiscordBot] Pumpkin auto-despawned (timeout)");
            }
          } catch (error) {
            logger?.error("❌ [DiscordBot] Error despawning pumpkin", { error });
          } finally {
            despawnClient.release();
          }
        }, 30000);
      } else {
        // No channels found, try again in 1 minute
        const nextSpawn = new Date(now.getTime() + 60000);
        await dbClient.query(
          "UPDATE discord_pumpkin_state SET next_spawn_at = $1 WHERE id = 1",
          [nextSpawn]
        );
        await dbClient.query("COMMIT");
      }
    } catch (error) {
      await dbClient.query("ROLLBACK");
      logger?.error("❌ [DiscordBot] Error auto-spawning pumpkin", { error });
    } finally {
      dbClient.release();
    }
  };
  
  // Check for auto-spawn every 10 seconds
  setInterval(spawnPumpkinAutomatically, 10000);
  // Also spawn immediately on startup
  setTimeout(spawnPumpkinAutomatically, 5000);

  logger?.info("🎃 [DiscordBot] Halloween Discord Bot initialized successfully!");
  
  return client;
}

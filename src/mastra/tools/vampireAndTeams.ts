import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EmbedBuilder } from "discord.js";
import { RuntimeContext } from "@mastra/core/di";
import { addCandyTool } from "./candyManager";
import { sharedPgPool } from "../storage";

const EMBED_COLOR = 0xe67e22;

// Bite command
export const biteCommandTool = createTool({
  id: "bite-command",
  description: "Bite another user to turn them into a vampire",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    guildId: z.string(),
    targetUserId: z.string().optional(),
    message: z.any(),
    userRoles: z.array(z.string()),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, guildId, targetUserId, message, userRoles } = context;
    
    logger?.info("🧛 [bite] Command executed", { userId, targetUserId, guildId });
    
    const member = message.member;
    const isAdmin = member?.permissions.has("Administrator");
    const hasVampireRole = userRoles.includes("1424364049956737126");
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      if (!isAdmin) {
        if (!hasVampireRole) {
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setDescription("❌ You need the Vampire role to bite others!");
          
          await message.reply({ embeds: [embed] });
          return { result: "no_vampire_role" };
        }
        
        const vampireCheck = await client.query(
          `SELECT last_bite FROM discord_vampires WHERE user_id = $1 AND guild_id = $2`,
          [userId, guildId]
        );
        
        if (vampireCheck.rows.length > 0 && vampireCheck.rows[0].last_bite) {
          const lastBite = new Date(vampireCheck.rows[0].last_bite);
          const now = new Date();
          const daysSinceLastBite = (now.getTime() - lastBite.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysSinceLastBite < 7) {
            const daysRemaining = Math.ceil(7 - daysSinceLastBite);
            const embed = new EmbedBuilder()
              .setColor(EMBED_COLOR)
              .setDescription(`🧛 You can only bite once per week! Wait **${daysRemaining} more days**.`);
            
            await message.reply({ embeds: [embed] });
            return { result: "cooldown_active" };
          }
        }
      }
      
      if (!targetUserId) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ Please mention a user to bite! Usage: `!bite @user`");
        
        await message.reply({ embeds: [embed] });
        return { result: "no_target" };
      }
      
      if (targetUserId === userId) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ You can't bite yourself!");
        
        await message.reply({ embeds: [embed] });
        return { result: "self_bite" };
      }
      
      const alreadyVampire = await client.query(
        `SELECT * FROM discord_vampires WHERE user_id = $1 AND guild_id = $2`,
        [targetUserId, guildId]
      );
      
      if (alreadyVampire.rows.length > 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("🧛 This user is already a vampire!");
        
        await message.reply({ embeds: [embed] });
        return { result: "already_vampire" };
      }
      
      await client.query(
        `INSERT INTO discord_vampires (user_id, guild_id, bitten_by, last_blood)
         VALUES ($1, $2, $3, NOW())`,
        [targetUserId, guildId, userId]
      );
      
      await client.query(
        `INSERT INTO discord_vampires (user_id, guild_id, last_bite)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET last_bite = NOW()`,
        [userId, guildId]
      );
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🧛 VAMPIRE BITE! 🧛")
        .setDescription(`**${username}** has bitten <@${targetUserId}>!\n\n🦇 They are now a vampire!\n\n**Vampire Benefits:**\n• 1.25x candy multiplier\n• 1.25x item drop chance\n• Can spread vampirism\n\n**Warning:** Vampires must drink blood or they will devampirize!`);
      
      await message.reply({ embeds: [embed] });
      logger?.info("🧛 [bite] User turned into vampire", { userId, targetUserId, guildId });
    } finally {
      client.release();
    }
    
    return { result: "bite_successful" };
  },
});

// Drink blood command
export const drinkBloodCommandTool = createTool({
  id: "drink-blood-command",
  description: "Vampires drink blood to maintain their status",
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
    
    logger?.info("🩸 [drinkBlood] Command executed", { userId, guildId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const vampireCheck = await client.query(
        `SELECT * FROM discord_vampires WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
      );
      
      if (vampireCheck.rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ You are not a vampire!");
        
        await message.reply({ embeds: [embed] });
        return { result: "not_vampire" };
      }
      
      await client.query(
        `UPDATE discord_vampires SET last_blood = NOW() WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
      );
      
      const candyReward = Math.floor(Math.random() * 51) + 25;
      const runtimeContext = new RuntimeContext();
      await addCandyTool.execute({
        context: { userId, amount: candyReward, source: "blood_drink", guildId },
        runtimeContext,
        mastra,
      });
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(`🩸 You drink the blood and feel refreshed!\n\n🍬 Gained **${candyReward} candies**!`);
      
      await message.reply({ embeds: [embed] });
      logger?.info("🩸 [drinkBlood] Blood consumed", { userId, candyReward });
    } finally {
      client.release();
    }
    
    return { result: "blood_consumed" };
  },
});

// Team join command
export const teamJoinCommandTool = createTool({
  id: "team-join-command",
  description: "Join a team",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    teamName: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, teamName, message } = context;
    
    logger?.info("🏴 [teamJoin] Command executed", { userId, guildId, teamName });
    
    const validTeams = ["Pumpkins", "Ghosts", "Witches", "Vampires"];
    
    if (!validTeams.includes(teamName)) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(`❌ Invalid team! Choose from: ${validTeams.join(", ")}`);
      
      await message.reply({ embeds: [embed] });
      return { result: "invalid_team" };
    }
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const existingTeam = await client.query(
        `SELECT team_name FROM discord_teams WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
      );
      
      if (existingTeam.rows.length > 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription(`❌ You're already on team **${existingTeam.rows[0].team_name}**!`);
        
        await message.reply({ embeds: [embed] });
        return { result: "already_on_team" };
      }
      
      await client.query(
        `INSERT INTO discord_teams (user_id, guild_id, team_name)
         VALUES ($1, $2, $3)`,
        [userId, guildId, teamName]
      );
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(`🏴 **You joined team ${teamName}!**\n\nWork together to collect the most candies and win rewards!`);
      
      await message.reply({ embeds: [embed] });
      logger?.info("🏴 [teamJoin] User joined team", { userId, guildId, teamName });
    } finally {
      client.release();
    }
    
    return { result: "team_joined" };
  },
});

// Team stats command
export const teamStatsCommandTool = createTool({
  id: "team-stats-command",
  description: "View team statistics",
  inputSchema: z.object({
    guildId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { guildId, message } = context;
    
    logger?.info("📊 [teamStats] Command executed", { guildId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const teamStats = await client.query(
        `SELECT t.team_name, COUNT(t.user_id) as member_count, COALESCE(SUM(c.candy_balance), 0) as total_candies
         FROM discord_teams t
         LEFT JOIN discord_candy_balances c ON t.user_id = c.user_id
         WHERE t.guild_id = $1
         GROUP BY t.team_name
         ORDER BY total_candies DESC`,
        [guildId]
      );
      
      if (teamStats.rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("📊 No teams have been formed yet!");
        
        await message.reply({ embeds: [embed] });
        return { result: "no_teams" };
      }
      
      let statsText = "📊 **TEAM STATISTICS** 📊\n\n";
      
      teamStats.rows.forEach((team: any, index: number) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
        statsText += `${medal} **${team.team_name}**\n`;
        statsText += `   └─ Members: ${team.member_count} | Total Candies: ${team.total_candies}\n\n`;
      });
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(statsText);
      
      await message.reply({ embeds: [embed] });
      logger?.info("📊 [teamStats] Stats displayed", { guildId });
    } finally {
      client.release();
    }
    
    return { result: "stats_displayed" };
  },
});

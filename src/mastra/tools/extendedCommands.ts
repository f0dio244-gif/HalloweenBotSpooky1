import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { RuntimeContext } from "@mastra/core/di";
import { addCandyTool, subtractCandyTool, getCandyBalanceTool } from "./candyManager";
import { sharedPgPool } from "../storage";

const EMBED_COLOR = 0xe67e22;

// Role lore data
const ROLE_LORES: { [key: string]: { name: string; lore: string } } = {
  "1424363966645403739": {
    name: "🎃 Pumpkin Collector",
    lore: "A humble gatherer of pumpkins, the first step on your Halloween journey. They wander the fields at dusk, collecting the finest pumpkins for the harvest festival."
  },
  "1424364014623785041": {
    name: "👻 Ghost",
    lore: "A spectral being that haunts the realm between worlds. Once mortal, now forever wandering, seeking to collect enough candy to find peace in the afterlife."
  },
  "1424364031560388638": {
    name: "💀 Skeleton",
    lore: "An undead warrior risen from the grave. Their bones rattle with each step, a reminder of the eternal dance between life and death."
  },
  "1424364049956737126": {
    name: "🧛 Vampire",
    lore: "A creature of the night who thirsts for more than just blood. Ancient and powerful, they command respect and fear throughout the Halloween realm."
  },
  "1424364070710018058": {
    name: "🧙 Witch",
    lore: "A master of dark magic and forbidden potions. They brew enchantments under the full moon, their cackle echoing through the misty Halloween night."
  },
  "1424364095070666802": {
    name: "👑 Pumpkin King",
    lore: "The supreme ruler of all pumpkins and Halloween festivities. Jack himself bows to the Pumpkin King, who commands the autumn harvest with absolute authority."
  },
  "1427687279601778760": {
    name: "🩸 The Necromancer",
    lore: "A dark sorcerer who commands the very essence of death itself. The Necromancer can raise armies of the undead and bend souls to their will. Their power is unmatched, their presence feared by all who value their mortal coil. Only the bravest dare to challenge their dominion over the realm of death."
  },
  "1427688233138917376": {
    name: "🪦 Gravekeeper",
    lore: "Guardian of the sacred burial grounds, the Gravekeeper protects the resting souls from those who would disturb them. They know every grave, every name, every story of those who sleep beneath the earth. With lantern in hand, they patrol the cemetery at night, ensuring the dead rest peacefully and the living respect the boundary between worlds."
  },
};

// Lore command
export const loreCommandTool = createTool({
  id: "lore-command",
  description: "Displays lore for a mentioned role",
  inputSchema: z.object({
    userId: z.string(),
    message: z.any(),
    roleId: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, message, roleId } = context;
    
    logger?.info("📜 [loreCommand] Command executed", { userId, roleId });
    
    if (!roleId) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ Please mention a role! Usage: `!lore @role`");
      
      await message.reply({ embeds: [embed] });
      return { result: "no_role_mentioned" };
    }
    
    const loreData = ROLE_LORES[roleId];
    
    if (!loreData) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("❌ No lore available for this role!");
      
      await message.reply({ embeds: [embed] });
      return { result: "no_lore_found" };
    }
    
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${loreData.name} - Lore`)
      .setDescription(loreData.lore);
    
    await message.reply({ embeds: [embed] });
    logger?.info("📜 [loreCommand] Lore displayed", { userId, roleId });
    return { result: "lore_displayed" };
  },
});

// Raid Boss command
export const raidBossCommandTool = createTool({
  id: "raid-boss-command",
  description: "Spawns a raid boss (admin only)",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    channelId: z.string(),
    message: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, channelId, message } = context;
    
    logger?.info("🐉 [raidBoss] Command executed", { userId, guildId });
    
    // Check if user is admin
    const member = message.member;
    if (!member?.permissions.has("Administrator")) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("🚫 **You need administrator permissions to spawn raid bosses!**");
      
      await message.reply({ embeds: [embed] });
      return { result: "permission_denied" };
    }
    
    const bosses = [
      { type: "shadow_lord", name: "👹 Shadow Lord", health: 5000, reward: 500, description: "A dark entity from the void" },
      { type: "pumpkin_golem", name: "🎃 Pumpkin Golem", health: 7500, reward: 750, description: "A massive animated pumpkin" },
      { type: "haunted_king", name: "👑 Haunted King", health: 10000, reward: 1000, description: "The cursed ruler of Halloween" },
    ];
    
    const selectedBoss = bosses[Math.floor(Math.random() * bosses.length)];
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO discord_raid_bosses (guild_id, channel_id, boss_type, boss_name, health, max_health, candy_reward)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         RETURNING id`,
        [guildId, channelId, selectedBoss.type, selectedBoss.name, selectedBoss.health, selectedBoss.reward]
      );
      
      const raidId = result.rows[0].id;
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`⚔️ RAID BOSS APPEARS! ⚔️`)
        .setDescription(`**${selectedBoss.name}** has spawned!\n\n${selectedBoss.description}\n\n💪 Health: **${selectedBoss.health}/${selectedBoss.health}**\n🍬 Reward: **${selectedBoss.reward} candies**\n\nClick the button below to attack!`);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_attack_${raidId}`)
            .setLabel("⚔️ Attack!")
            .setStyle(ButtonStyle.Danger)
        );
      
      const bossMessage = await message.reply({ embeds: [embed], components: [row] });
      
      await client.query(
        `UPDATE discord_raid_bosses SET message_id = $1 WHERE id = $2`,
        [bossMessage.id, raidId]
      );
      
      logger?.info("🐉 [raidBoss] Boss spawned", { userId, raidId, bossType: selectedBoss.type });
    } finally {
      client.release();
    }
    
    return { result: "boss_spawned" };
  },
});

// Raid attack button handler
export const raidAttackButtonTool = createTool({
  id: "raid-attack-button",
  description: "Handles raid boss attack button",
  inputSchema: z.object({
    userId: z.string(),
    username: z.string(),
    guildId: z.string(),
    customId: z.string(),
    interaction: z.any(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, username, guildId, customId, interaction } = context;
    
    const raidId = parseInt(customId.split("_")[2]);
    
    logger?.info("⚔️ [raidAttack] Attack button clicked", { userId, raidId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      const bossResult = await client.query(
        `SELECT * FROM discord_raid_bosses WHERE id = $1 AND active = true`,
        [raidId]
      );
      
      if (bossResult.rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("❌ This raid boss is no longer active!");
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return { result: "boss_inactive" };
      }
      
      const boss = bossResult.rows[0];
      const damage = Math.floor(Math.random() * 200) + 50;
      const newHealth = Math.max(0, boss.health - damage);
      
      // Record participation
      await client.query(
        `INSERT INTO discord_raid_participants (raid_id, user_id, damage_dealt)
         VALUES ($1, $2, $3)
         ON CONFLICT (raid_id, user_id)
         DO UPDATE SET damage_dealt = discord_raid_participants.damage_dealt + $3`,
        [raidId, userId, damage]
      );
      
      if (newHealth <= 0) {
        // Boss defeated!
        await client.query(
          `UPDATE discord_raid_bosses SET health = 0, active = false WHERE id = $1`,
          [raidId]
        );
        
        // Get all participants
        const participants = await client.query(
          `SELECT user_id, damage_dealt FROM discord_raid_participants WHERE raid_id = $1`,
          [raidId]
        );
        
        const runtimeContext = new RuntimeContext();
        
        // Distribute rewards proportionally
        const totalDamage = participants.rows.reduce((sum: number, p: any) => sum + p.damage_dealt, 0);
        for (const participant of participants.rows) {
          const rewardShare = Math.floor((participant.damage_dealt / totalDamage) * boss.candy_reward);
          await addCandyTool.execute({
            context: { userId: participant.user_id, amount: rewardShare, source: "raid_boss", guildId },
            runtimeContext,
            mastra,
          });
        }
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle("🎉 RAID BOSS DEFEATED! 🎉")
          .setDescription(`**${boss.boss_name}** has been slain!\n\n**${username}** dealt the final blow of **${damage} damage**!\n\n🍬 **${boss.candy_reward} candies** have been distributed among all participants!`);
        
        await interaction.update({ embeds: [embed], components: [] });
        logger?.info("🎉 [raidAttack] Boss defeated", { raidId, finalAttacker: userId });
      } else {
        // Update boss health
        await client.query(
          `UPDATE discord_raid_bosses SET health = $1 WHERE id = $2`,
          [newHealth, raidId]
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(`⚔️ RAID BOSS BATTLE! ⚔️`)
          .setDescription(`**${boss.boss_name}**\n\n**${username}** dealt **${damage} damage**!\n\n💪 Health: **${newHealth}/${boss.max_health}**\n🍬 Reward: **${boss.candy_reward} candies**\n\nClick the button below to attack!`);
        
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`raid_attack_${raidId}`)
              .setLabel("⚔️ Attack!")
              .setStyle(ButtonStyle.Danger)
          );
        
        await interaction.update({ embeds: [embed], components: [row] });
        logger?.info("⚔️ [raidAttack] Damage dealt", { userId, raidId, damage, newHealth });
      }
    } finally {
      client.release();
    }
    
    return { result: "attack_successful" };
  },
});

// Reset server candies command
export const resetServerCandiesCommandTool = createTool({
  id: "reset-server-candies-command",
  description: "Resets all candies in the server (admin only)",
  inputSchema: z.object({
    userId: z.string(),
    guildId: z.string(),
    message: z.any(),
    mode: z.enum(["all", "keep"]),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, guildId, message, mode } = context;
    
    logger?.info("🔄 [resetServerCandies] Command executed", { userId, guildId, mode });
    
    // Check if user is admin
    const member = message.member;
    if (!member?.permissions.has("Administrator")) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription("🚫 **You need administrator permissions to reset server candies!**");
      
      await message.reply({ embeds: [embed] });
      return { result: "permission_denied" };
    }
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    try {
      if (mode === "all") {
        await client.query(
          `UPDATE discord_candy_balances SET candy_balance = 0 WHERE user_id IN (
            SELECT DISTINCT user_id FROM discord_candy_history WHERE user_id IN (
              SELECT user_id FROM discord_candy_balances
            )
          )`
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("🔄 **All candies have been reset to 0 in this server!**");
        
        await message.reply({ embeds: [embed] });
        logger?.info("🔄 [resetServerCandies] All candies reset", { guildId });
      } else {
        // Keep 30% of candies
        await client.query(
          `UPDATE discord_candy_balances SET candy_balance = FLOOR(candy_balance * 0.3) WHERE user_id IN (
            SELECT DISTINCT user_id FROM discord_candy_history WHERE user_id IN (
              SELECT user_id FROM discord_candy_balances
            )
          )`
        );
        
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setDescription("🔄 **All users now have 30% of their previous candies!**");
        
        await message.reply({ embeds: [embed] });
        logger?.info("🔄 [resetServerCandies] Candies reset to 30%", { guildId });
      }
    } finally {
      client.release();
    }
    
    return { result: "candies_reset" };
  },
});

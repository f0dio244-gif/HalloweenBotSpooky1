import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPgPool } from "../storage";

async function getUpgradeMultiplier(userId: string): Promise<number> {
  if (!sharedPgPool) return 1;
  const client = await sharedPgPool.connect();
  try {
    const result = await client.query(
      "SELECT upgrade_level FROM discord_candy_upgrades WHERE user_id = $1",
      [userId]
    );
    const level = result.rows[0]?.upgrade_level || 0;
    return 1 + (level * 0.25);
  } finally {
    client.release();
  }
}

async function getGuildMultiplier(guildId?: string): Promise<number> {
  if (!sharedPgPool || !guildId) return 1;
  const client = await sharedPgPool.connect();
  try {
    const result = await client.query(
      "SELECT candy_multiplier FROM discord_bot_state WHERE guild_id = $1",
      [guildId]
    );
    return result.rows[0]?.candy_multiplier || 1.0;
  } finally {
    client.release();
  }
}

export const getCandyBalanceTool = createTool({
  id: "get-candy-balance",
  description: "Gets the candy balance for a Discord user",
  inputSchema: z.object({
    userId: z.string().describe("Discord user ID"),
  }),
  outputSchema: z.object({
    balance: z.number(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId } = context;
    
    logger?.info("🔧 [getCandyBalance] Getting balance", { userId });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    
    try {
      const result = await client.query(
        "SELECT candy_balance FROM discord_candy_balances WHERE user_id = $1",
        [userId]
      );
      
      const balance = result.rows[0]?.candy_balance || 0;
      logger?.info("✅ [getCandyBalance] Balance retrieved", { userId, balance });
      
      return { balance };
    } finally {
      client.release();
    }
  },
});

export const addCandyTool = createTool({
  id: "add-candy",
  description: "Adds candy to a user's balance",
  inputSchema: z.object({
    userId: z.string().describe("Discord user ID"),
    amount: z.number().describe("Amount of candy to add"),
    source: z.string().optional().describe("Source of the candy (e.g., 'trick_or_treat', 'pumpkin', 'passive')"),
    guildId: z.string().optional().describe("Discord guild ID for applying guild multiplier"),
  }),
  outputSchema: z.object({
    newBalance: z.number(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, amount, source = "unknown", guildId } = context;
    
    // Apply both upgrade and guild multipliers
    const upgradeMultiplier = await getUpgradeMultiplier(userId);
    const guildMultiplier = await getGuildMultiplier(guildId);
    const totalMultiplier = upgradeMultiplier * guildMultiplier;
    const finalAmount = Math.floor(amount * totalMultiplier);
    
    logger?.info("🔧 [addCandy] Adding candy", { userId, amount, upgradeMultiplier, guildMultiplier, totalMultiplier, finalAmount, source });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    
    try {
      const result = await client.query(
        `INSERT INTO discord_candy_balances (user_id, candy_balance) 
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET candy_balance = discord_candy_balances.candy_balance + $2
         RETURNING candy_balance`,
        [userId, finalAmount]
      );
      
      // Log to history
      await client.query(
        `INSERT INTO discord_candy_history (user_id, amount, source, earned_at)
         VALUES ($1, $2, $3, NOW())`,
        [userId, finalAmount, source]
      );
      
      const newBalance = result.rows[0].candy_balance;
      logger?.info("✅ [addCandy] Candy added successfully", { userId, amount: finalAmount, newBalance, source });
      
      return { newBalance };
    } finally {
      client.release();
    }
  },
});

export const subtractCandyTool = createTool({
  id: "subtract-candy",
  description: "Subtracts candy from a user's balance",
  inputSchema: z.object({
    userId: z.string().describe("Discord user ID"),
    amount: z.number().describe("Amount of candy to subtract"),
  }),
  outputSchema: z.object({
    newBalance: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, amount } = context;
    
    logger?.info("🔧 [subtractCandy] Subtracting candy", { userId, amount });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    
    try {
      // First get current balance
      const balanceResult = await client.query(
        "SELECT candy_balance FROM discord_candy_balances WHERE user_id = $1",
        [userId]
      );
      
      const currentBalance = balanceResult.rows[0]?.candy_balance || 0;
      
      if (currentBalance < amount) {
        logger?.warn("⚠️ [subtractCandy] Insufficient balance", { userId, currentBalance, amount });
        return { newBalance: currentBalance, success: false };
      }
      
      const result = await client.query(
        `UPDATE discord_candy_balances 
         SET candy_balance = candy_balance - $2
         WHERE user_id = $1
         RETURNING candy_balance`,
        [userId, amount]
      );
      
      const newBalance = result.rows[0].candy_balance;
      logger?.info("✅ [subtractCandy] Candy subtracted successfully", { userId, amount, newBalance });
      
      return { newBalance, success: true };
    } finally {
      client.release();
    }
  },
});

export const recordShopPurchaseTool = createTool({
  id: "record-shop-purchase",
  description: "Records a shop purchase for a user",
  inputSchema: z.object({
    userId: z.string().describe("Discord user ID"),
    roleId: z.string().describe("Discord role ID"),
    cost: z.number().describe("Cost of the purchase"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, roleId, cost } = context;
    
    logger?.info("🔧 [recordShopPurchase] Recording purchase", { userId, roleId, cost });
    
    if (!sharedPgPool) throw new Error("Database pool not initialized");
    const client = await sharedPgPool.connect();
    
    try {
      await client.query(
        `INSERT INTO discord_shop_purchases (user_id, role_id, cost, purchased_at) 
         VALUES ($1, $2, $3, NOW())`,
        [userId, roleId, cost]
      );
      
      logger?.info("✅ [recordShopPurchase] Purchase recorded", { userId, roleId });
      
      return { success: true };
    } finally {
      client.release();
    }
  },
});

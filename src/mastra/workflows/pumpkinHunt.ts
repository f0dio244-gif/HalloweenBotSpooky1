import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { sharedPgPool } from "../storage";

const spawnPumpkinStep = createStep({
  id: "spawn-pumpkin",
  description: "Spawns a pumpkin in a random channel for users to grab",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    channelId: z.string().optional(),
    candyAmount: z.number().optional(),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    
    logger?.info("🎃 [PumpkinHunt] Triggering pumpkin spawn request...");
    
    if (!sharedPgPool) {
      logger?.error("❌ [PumpkinHunt] Database pool not initialized");
      return { success: false };
    }
    
    const client = await sharedPgPool.connect();
    
    try {
      // Check if there's already an active pumpkin
      const activeCheck = await client.query(
        "SELECT * FROM discord_pumpkin_state WHERE id = 1 AND active = true"
      );
      
      if (activeCheck.rows.length > 0) {
        logger?.info("🎃 [PumpkinHunt] Pumpkin already active, skipping spawn");
        return { success: false };
      }
      
      // Set spawn_requested flag for Discord bot to pick up
      // Random candy amount (10-30)
      const candyAmount = Math.floor(Math.random() * 21) + 10;
      
      await client.query(
        `INSERT INTO discord_pumpkin_state (id, active, spawn_requested, candy_amount, spawned_at)
         VALUES (1, false, true, $1, NOW())
         ON CONFLICT (id) 
         DO UPDATE SET spawn_requested = true, candy_amount = $1, spawned_at = NOW()`,
        [candyAmount]
      );
      
      logger?.info("🎃 [PumpkinHunt] Pumpkin spawn requested", { candyAmount });
      
      return { success: true, candyAmount };
    } catch (error) {
      logger?.error("❌ [PumpkinHunt] Error requesting pumpkin spawn", { error });
      return { success: false };
    } finally {
      client.release();
    }
  },
});

export const pumpkinHuntWorkflow = createWorkflow({
  id: "pumpkin-hunt",
  description: "Spawns pumpkins in random channels for users to collect candies",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
  }),
})
  .then(spawnPumpkinStep)
  .commit();

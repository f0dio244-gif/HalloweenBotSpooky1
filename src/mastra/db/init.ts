import { sharedPgPool } from "../storage";

export async function initializeDatabase() {
  if (!sharedPgPool) return;
  
  const client = await sharedPgPool.connect();
  
  try {
    // Create discord_bot_state table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_bot_state (
        guild_id VARCHAR(255) PRIMARY KEY,
        enabled BOOLEAN DEFAULT true,
        candy_multiplier DECIMAL DEFAULT 1.0
      )
    `);
    
    // Create discord_pumpkin_state table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_pumpkin_state (
        id INTEGER PRIMARY KEY,
        active BOOLEAN DEFAULT false,
        spawn_requested BOOLEAN DEFAULT false,
        channel_id VARCHAR(255),
        message_id VARCHAR(255),
        candy_amount INTEGER,
        spawned_at TIMESTAMP,
        next_spawn_at TIMESTAMP
      )
    `);
    
    // Initialize pumpkin state row if it doesn't exist
    await client.query(`
      INSERT INTO discord_pumpkin_state (id, active, spawn_requested)
      VALUES (1, false, false)
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Add next_spawn_at column if it doesn't exist
    await client.query(`
      ALTER TABLE discord_pumpkin_state 
      ADD COLUMN IF NOT EXISTS next_spawn_at TIMESTAMP
    `);
    
    // Add candy_multiplier column if it doesn't exist
    await client.query(`
      ALTER TABLE discord_bot_state 
      ADD COLUMN IF NOT EXISTS candy_multiplier DECIMAL DEFAULT 1.0
    `);
    
    // Create discord_candy_balances table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_candy_balances (
        user_id VARCHAR(255) PRIMARY KEY,
        candy_balance INTEGER DEFAULT 0
      )
    `);
    
    // Create discord_candy_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_candy_history (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        amount INTEGER NOT NULL,
        source VARCHAR(255),
        earned_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create discord_candy_upgrades table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_candy_upgrades (
        user_id VARCHAR(255) PRIMARY KEY,
        upgrade_level INTEGER DEFAULT 0
      )
    `);
    
    // Create discord_cooldowns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_cooldowns (
        user_id VARCHAR(255) NOT NULL,
        command VARCHAR(255) NOT NULL,
        last_used TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, command)
      )
    `);
    
    // Create discord_shop_purchases table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_shop_purchases (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        role_id VARCHAR(255) NOT NULL,
        cost INTEGER NOT NULL,
        purchased_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    throw error;
  } finally {
    client.release();
  }
}

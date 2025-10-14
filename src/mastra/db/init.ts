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
    
    // Create discord_powerups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_powerups (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        powerup_type VARCHAR(255) NOT NULL,
        powerup_name VARCHAR(255) NOT NULL,
        multiplier DECIMAL,
        duration_minutes INTEGER,
        acquired_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        active BOOLEAN DEFAULT true
      )
    `);
    
    // Create discord_usable_powerups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_usable_powerups (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        powerup_type VARCHAR(255) NOT NULL,
        powerup_name VARCHAR(255) NOT NULL,
        powerup_data JSONB,
        acquired_at TIMESTAMP DEFAULT NOW(),
        used BOOLEAN DEFAULT false,
        used_at TIMESTAMP
      )
    `);
    
    // Create discord_role_multipliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_role_multipliers (
        user_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        role_multipliers JSONB DEFAULT '[]',
        PRIMARY KEY (user_id, guild_id)
      )
    `);
    
    // Create discord_halloween_dms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_halloween_dms (
        user_id VARCHAR(255) PRIMARY KEY,
        dm_sent BOOLEAN DEFAULT false,
        sent_at TIMESTAMP
      )
    `);
    
    // Create discord_raid_bosses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_raid_bosses (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        boss_type VARCHAR(255) NOT NULL,
        boss_name VARCHAR(255) NOT NULL,
        health INTEGER NOT NULL,
        max_health INTEGER NOT NULL,
        candy_reward INTEGER NOT NULL,
        spawned_at TIMESTAMP DEFAULT NOW(),
        message_id VARCHAR(255),
        active BOOLEAN DEFAULT true
      )
    `);
    
    // Create discord_raid_participants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_raid_participants (
        raid_id INTEGER REFERENCES discord_raid_bosses(id),
        user_id VARCHAR(255) NOT NULL,
        damage_dealt INTEGER DEFAULT 0,
        PRIMARY KEY (raid_id, user_id)
      )
    `);
    
    // Create discord_curses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_curses (
        id SERIAL PRIMARY KEY,
        user1_id VARCHAR(255) NOT NULL,
        user2_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        active BOOLEAN DEFAULT true
      )
    `);
    
    // Create discord_quests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_quests (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        quest_type VARCHAR(255) NOT NULL,
        quest_description VARCHAR(500) NOT NULL,
        quest_data JSONB,
        progress INTEGER DEFAULT 0,
        required_progress INTEGER NOT NULL,
        reward_candies INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP
      )
    `);
    
    // Create discord_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_items (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_type VARCHAR(255) NOT NULL,
        rarity VARCHAR(50) NOT NULL,
        boost_data JSONB,
        acquired_at TIMESTAMP DEFAULT NOW(),
        used BOOLEAN DEFAULT false,
        used_at TIMESTAMP
      )
    `);
    
    // Create discord_achievements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_achievements (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        achievement_key VARCHAR(255) NOT NULL,
        achievement_name VARCHAR(255) NOT NULL,
        earned_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, achievement_key)
      )
    `);
    
    // Create discord_vampires table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_vampires (
        user_id VARCHAR(255) PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        turned_at TIMESTAMP DEFAULT NOW(),
        last_bite TIMESTAMP,
        last_blood TIMESTAMP,
        bitten_by VARCHAR(255)
      )
    `);
    
    // Create discord_daily_rewards table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_daily_rewards (
        user_id VARCHAR(255) PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        last_claimed TIMESTAMP
      )
    `);
    
    // Create discord_story_mode table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_story_mode (
        guild_id VARCHAR(255) PRIMARY KEY,
        active BOOLEAN DEFAULT false,
        paused BOOLEAN DEFAULT false,
        started_by VARCHAR(255),
        started_at TIMESTAMP,
        current_chapter INTEGER DEFAULT 0
      )
    `);
    
    // Create discord_teams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_teams (
        user_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        joined_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, guild_id)
      )
    `);
    
    // Create discord_pvp table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_pvp (
        id SERIAL PRIMARY KEY,
        attacker_id VARCHAR(255) NOT NULL,
        defender_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        winner_id VARCHAR(255),
        wager_candies INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        completed BOOLEAN DEFAULT false
      )
    `);
    
    // Create discord_collector_offers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_collector_offers (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        offered_item_id INTEGER REFERENCES discord_items(id),
        reward_item_name VARCHAR(255),
        reward_item_rarity VARCHAR(50),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create discord_environmental_events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_environmental_events (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        message_id VARCHAR(255),
        active BOOLEAN DEFAULT true,
        spawned_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create discord_trivia table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_trivia (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        question VARCHAR(500) NOT NULL,
        correct_answer VARCHAR(255) NOT NULL,
        reward_candies INTEGER NOT NULL,
        message_id VARCHAR(255),
        active BOOLEAN DEFAULT true,
        asked_at TIMESTAMP DEFAULT NOW()
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

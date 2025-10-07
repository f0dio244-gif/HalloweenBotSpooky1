
-- Create tables for Halloween Discord Bot

CREATE TABLE IF NOT EXISTS discord_candy_balances (
    user_id VARCHAR(255) PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discord_cooldowns (
    user_id VARCHAR(255) PRIMARY KEY,
    last_trick_or_treat TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discord_pumpkin_hunt (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255),
    spawned_at TIMESTAMP DEFAULT NOW(),
    grabbed_by VARCHAR(255),
    grabbed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discord_shop_purchases (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    role_id VARCHAR(255) NOT NULL,
    cost INTEGER NOT NULL,
    purchased_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pumpkin_hunt_channel ON discord_pumpkin_hunt(channel_id);
CREATE INDEX IF NOT EXISTS idx_pumpkin_hunt_spawned ON discord_pumpkin_hunt(spawned_at);
CREATE INDEX IF NOT EXISTS idx_shop_purchases_user ON discord_shop_purchases(user_id);

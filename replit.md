# Agent Stack with Mastra Framework

## Overview

This is a multi-platform AI agent application built with the Mastra framework. The system creates dynamic, context-aware agents that can interact across multiple platforms including Discord, Slack, and Telegram. The agents are designed to run workflows, manage user interactions, and execute tasks using various tools and integrations.

The application features SpookyTreatsBot - a comprehensive Halloween-themed Discord bot with extensive game mechanics including:
- Candy collection system with passive and active earning
- Multi-page shop with roles, powerups, and upgrades
- Raid boss battles with health tracking
- PVP combat system with wagers
- Vampire infection mechanics
- Team-based competition
- Daily quests and rewards
- Story mode progression
- Inventory system with rare items
- Profile with achievements tracking
- Halloween trivia and riddles
- Spooky market with chance-based items
- The Collector NPC with bargaining
- 25+ interactive commands

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 15, 2025 - Admin Tools & Cooldown Enhancement
- **Admin Candy Management**: Added !removecandy admin command for removing candies from users
- **Vampire Cooldown**: Implemented 6-hour cooldown for !drinkblood command to balance vampire gameplay
- **Help System Update**: Updated command list to include new !removecandy admin command

### October 2025 - Major Feature Expansion
- **Command System Overhaul**: Changed !givecandy to !addcandy (admin) and created new !givecandy for player-to-player transfers
- **Advanced Combat**: Added !sraidboss command spawning 3 raid bosses (Pumpkin Lord, Haunted Scarecrow, Ghost King) with health tracking and button-based attacks
- **Role Lore System**: !lore command provides backstories for all shop roles
- **Comprehensive Inventory**: !inventory command with item rarities (common to mythic) and boost effects
- **Profile & Achievements**: !profile displays stats, achievements (First Candy, Candy Hoarder, etc.), and player progression
- **PVP System**: Player vs player battles with optional candy wagers using !pvp command
- **Vampire Mechanics**: !bite to spread vampirism, !drinkblood for candy harvesting (6h cooldown)
- **Team Competition**: 4 teams (Pumpkins, Ghosts, Witches, Vampires) with !team join and !teamstats leaderboard
- **Quest System**: Daily quests with Social, Exploration, and Luck-based challenges tracked via !quests
- **Story Mode**: Interactive narrative with !story start/stop/pause/resume controls delivering episodic content
- **Spooky Market**: Random merchant appearances with rare item purchases using !spookymarket
- **Halloween Trivia**: Spooky riddles and trivia with candy rewards via !trivia command
- **The Collector**: Mysterious NPC offering trades with Accept/Bargain/Refuse button options via !offer
- **Daily Rewards**: Role-based daily bonuses (50-200 candies) claimable with !daily
- **Shop Expansion**: Added page 2 with Necromancer (5000 candies, 3x multiplier) and Gravekeeper (3000 candies, 2x multiplier) powerup roles
- **Help System**: Comprehensive !commands/!help with 2-page embed showing all 25+ commands
- **Database Schema**: Expanded to 15+ tables supporting raids, PVP, vampires, teams, quests, achievements, inventory, and events

## System Architecture

### Core Framework
- **Mastra Core**: Orchestrates agents, workflows, tools, and integrations
- **Language**: TypeScript with ES2022 module system
- **Runtime**: Node.js 20.9.0+
- **Development Tool**: Mastra CLI for dev server and build management

### Agent Architecture
- **Dynamic Agents**: Runtime-configurable agents that adapt instructions, models, and tools based on context
- **Runtime Context**: Dependency injection system for passing user-specific data (IDs, preferences, tiers) to agents
- **Model Selection**: Supports multiple AI providers (OpenAI, OpenRouter) with dynamic model switching
- **Tool System**: Modular tools for specific tasks (candy management, Discord commands, etc.)

### Workflow Engine
- **Inngest Integration**: Event-driven workflow orchestration with retry capabilities
- **Step-based Execution**: Workflows composed of discrete, reusable steps
- **Cron Workflows**: Scheduled workflows (e.g., pumpkin hunt spawning)
- **API Triggers**: HTTP endpoints that trigger Inngest workflows

### Platform Integrations

**Discord Bot**
- Event-driven message handling and button interactions
- Command system (!trickortreat, !shop, !grab)
- Cooldown management and user state tracking
- Rich embeds and interactive components (buttons)

**Slack Integration**
- Message channel monitoring
- Conversation threading support
- SSE streaming for real-time updates

**Telegram Integration**
- Webhook-based message handling
- User interaction processing

### Data Layer
- **PostgreSQL Storage**: Primary database using `@mastra/pg` adapter
- **Shared Storage Pattern**: Single PostgreSQL instance shared across components
- **Fallback Design**: System gracefully degrades if database unavailable (Discord bot still functions)
- **Schema**: User balances, cooldowns, pumpkin state, shop transactions

### Logging System
- **Pino Logger**: Production-grade structured logging
- **Custom Logger**: Extended MastraLogger with ISO timestamps and level formatting
- **Log Levels**: Configurable (DEBUG, INFO, WARN, ERROR)

### Development Tools
- **MCP Server**: Model Context Protocol server integration
- **Live Reload**: Development server with SSE-based hot reloading
- **Playground**: Built-in UI for testing agents and workflows
- **TypeScript**: Strict mode enabled with modern ES module support

### External Services
- **AI Models**: OpenAI (GPT-3.5/4), OpenRouter
- **Exa Search**: Web search integration via exa-js
- **Memory Management**: `@mastra/memory` for agent conversation context
- **LibSQL**: Alternative database option via `@mastra/libsql`

### Error Handling
- **MastraError**: Framework-specific error types
- **NonRetriableError**: Inngest errors for workflow control
- **Retry Logic**: Configurable retry attempts (3 in production, 0 in dev)
- **Graceful Degradation**: Components fail independently without cascading

### Code Organization
- `/src/mastra/`: Core Mastra configuration and initialization
- `/src/triggers/`: Platform-specific trigger handlers (Discord, Slack, Telegram)
- `/src/mastra/tools/`: Reusable tool definitions
- `/src/mastra/workflows/`: Workflow definitions
- `/src/mastra/bots/`: Bot initialization and setup
- `/src/mastra/storage/`: Database configuration
- `/.mastra/output/`: Build artifacts and playground files

## External Dependencies

### AI & ML Services
- **OpenAI**: Primary LLM provider (GPT models)
- **OpenRouter**: Alternative AI model provider
- **Vercel AI SDK**: Unified interface for AI models

### Database & Storage
- **PostgreSQL**: Primary database (configurable via DATABASE_URL or PG* env vars)
- **LibSQL**: Optional SQLite-based storage
- **@mastra/pg**: PostgreSQL adapter for Mastra
- **@mastra/libsql**: LibSQL adapter

### Messaging Platforms
- **Discord.js**: Discord bot SDK with gateway intents
- **@slack/web-api**: Slack API client
- **Telegram Bot API**: Via webhook integration

### Workflow & Events
- **Inngest**: Event-driven workflow engine
- **@inngest/realtime**: Real-time updates for development
- **inngest-cli**: CLI for Inngest development

### Utilities
- **Zod**: Schema validation and type safety
- **Pino**: High-performance logging
- **dotenv**: Environment variable management
- **tsx**: TypeScript execution for development
- **exa-js**: Web search capabilities

### Development Tools
- **TypeScript**: Type system and compiler
- **Prettier**: Code formatting
- **ts-node**: TypeScript execution
- **Mastra CLI**: Framework-specific tooling
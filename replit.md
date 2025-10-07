# Agent Stack with Mastra Framework

## Overview

This is a multi-platform AI agent application built with the Mastra framework. The system creates dynamic, context-aware agents that can interact across multiple platforms including Discord, Slack, and Telegram. The agents are designed to run workflows, manage user interactions, and execute tasks using various tools and integrations.

The application features a Halloween-themed Discord bot with candy collection mechanics, pumpkin hunts, and shop functionality, demonstrating the framework's capability to build engaging, stateful bot experiences.

## User Preferences

Preferred communication style: Simple, everyday language.

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
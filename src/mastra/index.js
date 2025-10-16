const { Mastra } = require("@mastra/core");
const { MastraError } = require("@mastra/core/error");
const { PinoLogger } = require("@mastra/loggers");
const { LogLevel, MastraLogger } = require("@mastra/core/logger");
const pino = require("pino");
const { MCPServer } = require("@mastra/mcp");
const { NonRetriableError } = require("inngest");
const { z } = require("zod");

const { sharedPostgresStorage } = require("./storage");
const { inngest, inngestServe, registerCronWorkflow } = require("./inngest");
// const { pumpkinHuntWorkflow } = require("./workflows/pumpkinHunt");
const { initializeDiscordBot } = require("./bots/discordBot");

class ProductionPinoLogger extends MastraLogger {
  constructor(options = {}) {
    super(options);
    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label, _number) => ({ level: label }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message, args = {}) { this.logger.debug(args, message); }
  info(message, args = {}) { this.logger.info(args, message); }
  warn(message, args = {}) { this.logger.warn(args, message); }
  error(message, args = {}) { this.logger.error(args, message); }
}

const mastra = new Mastra({
  storage: sharedPostgresStorage,
  agents: {},
  workflows: {},
  mcpServers: {
    allTools: new MCPServer({ name: "allTools", version: "1.0.0", tools: {} }),
  },
  bundler: {
    externals: ["@slack/web-api", "inngest", "inngest/hono", "hono", "hono/streaming"],
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    middleware: [
      async (c, next) => {
        const mastraInst = c.get("mastra");
        const logger = mastraInst?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try { await next(); } 
        catch (error) {
          logger?.error("[Response]", { method: c.req.method, url: c.req.url, error });
          if (error instanceof MastraError && error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
            throw new NonRetriableError(error.message, { cause: error });
          } else if (error instanceof z.ZodError) {
            throw new NonRetriableError(error.message, { cause: error });
          }
          throw error;
        }
      },
    ],
    apiRoutes: [
      {
        path: "/api/inngest",
        method: "ALL",
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },
    ],
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({ name: "Mastra", level: "info" })
      : new PinoLogger({ name: "Mastra", level: "info" }),
});

/* Sanity checks */
if (Object.keys(mastra.getWorkflows()).length > 1) {
  throw new Error("More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.");
}
if (Object.keys(mastra.getAgents()).length > 1) {
  throw new Error("More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.");
}

// Note: Pumpkin hunt workflow disabled due to missing database connection

// Initialize Discord Bot
initializeDiscordBot(mastra).catch((error) => {
  mastra.getLogger()?.error("Failed to initialize Discord bot", { error });
});

module.exports = mastra;

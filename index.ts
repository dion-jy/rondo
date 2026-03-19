import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { join } from "path";
import { existsSync } from "fs";
import { resolveConfig, isConfigured } from "./src/config.js";
import { syncToSupabase } from "./src/sync.js";

const plugin = {
  id: "rondo",
  name: "Rondo",
  description: "Cron monitoring dashboard — syncs job/run data to external storage",

  configSchema: {
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        supabaseUrl: { type: "string" },
        supabaseKey: { type: "string" },
        syncIntervalMs: { type: "number", default: 300000 },
        userId: { type: "string" },
        supabaseAuthEmail: { type: "string" },
      },
    },
  },

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

    if (!isConfigured(config)) {
      logger.info(
        "[rondo] Supabase not configured — plugin loaded but sync disabled. " +
        "Set supabaseUrl + supabaseKey in plugin config or env (RONDO_SUPABASE_URL, RONDO_SUPABASE_KEY)."
      );
    }

    // Register as a background service for periodic sync
    api.registerService({
      id: "rondo-sync",

      async start(ctx) {
        const candidates = [
          join(ctx.stateDir, "..", "cron"),
          join(ctx.stateDir, "..", "..", "cron"),
          "/root/.openclaw/cron",
        ];
        const cronDir =
          candidates.find((d) => existsSync(join(d, "jobs.json"))) ?? candidates[0];
        const interval = config.syncIntervalMs ?? 300_000;

        ctx.logger.info(
          `[rondo] Service started — sync every ${Math.round(interval / 1000)}s (cronDir=${cronDir})`
        );

        // Initial sync after a short delay (let gateway finish startup)
        const initialDelay = setTimeout(async () => {
          try {
            await syncToSupabase(cronDir, config, ctx.logger);
          } catch (err) {
            ctx.logger.error(
              `[rondo] Initial sync error: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }, 5_000);

        // Periodic sync
        const timer = setInterval(async () => {
          try {
            await syncToSupabase(cronDir, config, ctx.logger);
          } catch (err) {
            ctx.logger.error(
              `[rondo] Sync error: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }, interval);

        // Store timer references for cleanup
        (ctx as any)._rondoTimers = { initialDelay, timer };
      },

      stop(ctx) {
        const timers = (ctx as any)._rondoTimers;
        if (timers) {
          clearTimeout(timers.initialDelay);
          clearInterval(timers.timer);
        }
        ctx.logger.info("[rondo] Service stopped");
      },
    });

    // Register a /rondo-status command for quick health check
    api.registerCommand({
      name: "rondo-status",
      description: "Show Rondo sync status",
      requireAuth: true,
      handler(_cmdCtx) {
        const configured = isConfigured(config);
        return {
          text: configured
            ? `🎵 Rondo: Supabase sync active (every ${Math.round((config.syncIntervalMs ?? 300000) / 1000)}s)\nURL: ${config.supabaseUrl?.replace(/\/\/(.{6}).*@/, "//$1***@") ?? "—"}`
            : "🎵 Rondo: loaded but Supabase not configured. Set supabaseUrl + supabaseKey.",
        };
      },
    });

    logger.info("[rondo] Plugin registered");
  },
};

export default plugin;

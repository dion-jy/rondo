import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { join } from "path";
import { existsSync } from "fs";
import { resolveConfig } from "./src/config.js";
import { syncToSupabase, claimLinkToken, getSavedUserId, saveUserId } from "./src/sync.js";

/** Extract a link token from a URL (query param) or treat raw string as token */
function extractToken(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return url.searchParams.get("token") ?? undefined;
  } catch {
    return raw || undefined;
  }
}

const plugin = {
  id: "rondo",
  name: "Rondo",
  description: "Cron monitoring dashboard — syncs job/run data to external storage",

  configSchema: {
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        syncIntervalMs: { type: "number", default: 300000 },
      },
    },
  },

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

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
            await syncToSupabase(cronDir, ctx.logger);
          } catch (err) {
            ctx.logger.error(
              `[rondo] Initial sync error: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }, 5_000);

        // Periodic sync
        const timer = setInterval(async () => {
          try {
            await syncToSupabase(cronDir, ctx.logger);
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

    // Resolve cronDir once for command use (same logic as service start)
    let resolvedCronDir: string | undefined;
    function getCronDir(stateDir: string): string {
      if (resolvedCronDir) return resolvedCronDir;
      const candidates = [
        join(stateDir, "..", "cron"),
        join(stateDir, "..", "..", "cron"),
        "/root/.openclaw/cron",
      ];
      resolvedCronDir =
        candidates.find((d) => existsSync(join(d, "jobs.json"))) ?? candidates[0];
      return resolvedCronDir;
    }

    // Register /rondo command with link + status subcommands
    api.registerCommand({
      name: "rondo",
      description: "Rondo plugin commands. Usage: /rondo link <URL> | /rondo status",
      acceptsArgs: true,
      requireAuth: true,
      async handler(cmdCtx) {
        const args = cmdCtx.args?.trim() || "";
        const stateDir = api.runtime?.state?.resolveStateDir?.() ?? "/root/.openclaw/state";
        const cronDir = getCronDir(stateDir);

        if (args.startsWith("link ")) {
          const raw = args.slice(5).trim();
          const token = extractToken(raw);
          if (!token) return { text: "Invalid link URL or token." };

          const userId = await claimLinkToken(token, logger);
          if (!userId) return { text: "Token expired or already used." };

          saveUserId(cronDir, userId);
          return { text: `Device linked! Your cron data is now connected to your Rondo account.` };
        }

        if (args === "status") {
          const userId = getSavedUserId(cronDir);
          if (userId) return { text: `Linked (user: ${userId.slice(0, 8)}...)` };
          return { text: "Not linked. Use /rondo link <URL> to connect." };
        }

        return { text: "Usage: /rondo link <URL> | /rondo status" };
      },
    });

    // Register CLI subcommands: `openclaw rondo link <url>` / `openclaw rondo status`
    api.registerCli(
      ({ program }) => {
        const rondo = program.command("rondo").description("Rondo plugin commands");

        rondo
          .command("link <url>")
          .description("Link this device to your Rondo web account")
          .action(async (url: string) => {
            const stateDir =
              api.runtime?.state?.resolveStateDir?.() ?? "/root/.openclaw/state";
            const cronDir = getCronDir(stateDir);
            const token = extractToken(url);
            if (!token) {
              console.error("❌ Invalid link URL or token");
              process.exit(1);
            }
            const userId = await claimLinkToken(token, logger);
            if (!userId) {
              console.error("❌ Token expired or already used");
              process.exit(1);
            }
            saveUserId(cronDir, userId);
            console.log("✅ Device linked successfully!");
          });

        rondo
          .command("status")
          .description("Check linking status")
          .action(() => {
            const stateDir =
              api.runtime?.state?.resolveStateDir?.() ?? "/root/.openclaw/state";
            const cronDir = getCronDir(stateDir);
            const userId = getSavedUserId(cronDir);
            if (userId) {
              console.log(`✅ Linked (user: ${userId.slice(0, 8)}...)`);
            } else {
              console.log("❌ Not linked. Use: openclaw rondo link <URL>");
            }
          });
      },
      { commands: ["rondo"] }
    );

    logger.info("[rondo] Plugin registered");
  },
};

export default plugin;

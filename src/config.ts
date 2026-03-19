import type { RondoPluginConfig } from "./types.js";

// ── Default configuration ──

export const DEFAULT_SYNC_INTERVAL_MS = 300_000; // 5 minutes
export const SUPABASE_BATCH_SIZE = 100;

// ── Resolve config from plugin config + env ──

export function resolveConfig(pluginConfig?: Record<string, unknown>): RondoPluginConfig {
  const cfg = (pluginConfig ?? {}) as Partial<RondoPluginConfig>;

  return {
    supabaseUrl: cfg.supabaseUrl || process.env.RONDO_SUPABASE_URL || undefined,
    supabaseKey: cfg.supabaseKey || process.env.RONDO_SUPABASE_KEY || undefined,
    syncIntervalMs: cfg.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
    userId: cfg.userId || process.env.RONDO_USER_ID || undefined,
    supabaseAuthEmail: cfg.supabaseAuthEmail || process.env.RONDO_AUTH_EMAIL || undefined,
  };
}

export function isConfigured(config: RondoPluginConfig): boolean {
  return !!(config.supabaseUrl && config.supabaseKey);
}

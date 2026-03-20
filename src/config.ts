import type { RondoPluginConfig } from "./types.js";

// ── Hardcoded Supabase credentials (anon key is public, like a Firebase API key) ──

export const SUPABASE_URL = "https://hjqwbrguuqoymljattef.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcXdicmd1dXFveW1samF0dGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTA0NjIsImV4cCI6MjA4ODcyNjQ2Mn0.Q3FePoE0jVVBbfSEiR55YPy-b5kAblR8MZZCmxSxW-4";

// ── Default configuration ──

export const DEFAULT_SYNC_INTERVAL_MS = 300_000; // 5 minutes
export const SUPABASE_BATCH_SIZE = 100;

// ── Resolve config from plugin config ──

export function resolveConfig(pluginConfig?: Record<string, unknown>): RondoPluginConfig {
  const cfg = (pluginConfig ?? {}) as Partial<RondoPluginConfig>;

  return {
    syncIntervalMs: cfg.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
  };
}

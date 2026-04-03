import type { RondoPluginConfig } from "./types.js";

// ── Hardcoded Supabase credentials (anon key is public, like a Firebase API key) ──

export const SUPABASE_URL = "https://hjqwbrguuqoymljattef.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcXdicmd1dXFveW1samF0dGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTA0NjIsImV4cCI6MjA4ODcyNjQ2Mn0.rOmW5fRbsGm4itHlCN6N2_eM4t9E5QfCkiF2eEzuAsw";

// Service role key for sync operations (bypasses RLS).
// Read from env so it's never hardcoded in distributed code.
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.RONDO_SUPABASE_SERVICE_ROLE_KEY ?? "";

// The key used for sync writes: service_role if available, else anon (legacy fallback).
export const SUPABASE_SYNC_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

// ── Default configuration ──

export const DEFAULT_SYNC_INTERVAL_MS = 300_000; // 5 minutes
export const SUPABASE_BATCH_SIZE = 100;
export const DEFAULT_PUSH_TRIGGER_MODE = "auto";
export const RONDO_PUSH_NOTIFY_URL =
  process.env.RONDO_PUSH_NOTIFY_URL ?? "";
export const RONDO_PUSH_NOTIFY_SHARED_SECRET =
  process.env.RONDO_PUSH_NOTIFY_SHARED_SECRET ?? "";

function normalizePushTriggerMode(
  value: unknown,
): RondoPluginConfig["pushTriggerMode"] {
  return value === "managed" || value === "legacy" || value === "off"
    ? value
    : DEFAULT_PUSH_TRIGGER_MODE;
}

// ── Resolve config from plugin config ──

export function resolveConfig(pluginConfig?: Record<string, unknown>): RondoPluginConfig {
  const cfg = (pluginConfig ?? {}) as Partial<RondoPluginConfig>;

  return {
    syncIntervalMs: cfg.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
    pushNotifyUrl:
      (cfg.pushNotifyUrl ?? RONDO_PUSH_NOTIFY_URL) || undefined,
    pushNotifySharedSecret:
      (cfg.pushNotifySharedSecret ?? RONDO_PUSH_NOTIFY_SHARED_SECRET) || undefined,
    pushTriggerMode: normalizePushTriggerMode(cfg.pushTriggerMode),
    supabaseUrl: cfg.supabaseUrl,
    supabaseKey: cfg.supabaseKey,
    userId: cfg.userId,
    supabaseAuthEmail: cfg.supabaseAuthEmail,
  };
}

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const distSyncPath = join(dirname(new URL(import.meta.url).pathname), "..", ".tmp-dist", "sync.js");
const { readSessions } = await import(pathToFileURL(distSyncPath).href);

function writeSessionFile(baseDir, agent, fileName, lines) {
  const sessionsDir = join(baseDir, "agents", agent, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  const filePath = join(sessionsDir, fileName);
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
  const now = new Date();
  utimesSync(filePath, now, now);
}

function makeFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "rondo-session-fixture-"));
  mkdirSync(join(rootDir, "cron"), { recursive: true });
  return rootDir;
}

function cleanupFixture(rootDir) {
  rmSync(rootDir, { recursive: true, force: true });
}

const now = new Date();
const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
const thirtySecondsAgo = new Date(now.getTime() - 30_000).toISOString();

const multiAgentRoot = makeFixture();
try {
  writeSessionFile(multiAgentRoot, "claude", "claude-session.jsonl", [
    JSON.stringify({
      type: "session",
      id: "agent:claude:acp:11111111-1111-1111-1111-111111111111",
      timestamp: oneMinuteAgo,
      label: "[P10] Claude sync regression check",
    }),
    JSON.stringify({
      type: "message",
      timestamp: thirtySecondsAgo,
      message: {
        role: "assistant",
        model: "claude-sonnet-4-6",
        stopReason: "stop",
        usage: { totalTokens: 321 },
        content: "Claude session synced",
      },
    }),
  ]);

  writeSessionFile(multiAgentRoot, "codex", "codex-session.jsonl", [
    JSON.stringify({
      type: "session",
      id: "agent:codex:acp:22222222-2222-2222-2222-222222222222",
      timestamp: oneMinuteAgo,
    }),
    JSON.stringify({
      type: "message",
      timestamp: oneMinuteAgo,
      message: {
        role: "user",
        content: "[Wed 2026-04-01 23:58 GMT+9] Fix Rondo multi-agent ACP sync visibility",
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: thirtySecondsAgo,
      message: {
        role: "assistant",
        model: "gpt-5-codex",
        stopReason: "stop",
        usage: { total_tokens: 654 },
        content: "Codex session synced",
      },
    }),
  ]);

  const sessions = readSessions(join(multiAgentRoot, "cron"));
  const byKey = new Map(sessions.map((session) => [session.key, session]));

  assert.equal(sessions.length, 2, "expected claude and codex sessions to be discovered");
  assert.equal(
    byKey.get("agent:claude:acp:11111111-1111-1111-1111-111111111111")?.agent,
    "claude",
    "claude session should preserve claude agent"
  );
  assert.equal(
    byKey.get("agent:codex:acp:22222222-2222-2222-2222-222222222222")?.agent,
    "codex",
    "codex session should preserve codex agent"
  );
  assert.match(
    byKey.get("agent:codex:acp:22222222-2222-2222-2222-222222222222")?.label ?? "",
    /Fix Rondo multi-agent ACP sync visibility/,
    "codex session label should still be parsed from the first user message"
  );
} finally {
  cleanupFixture(multiAgentRoot);
}

const claudeOnlyRoot = makeFixture();
try {
  writeSessionFile(claudeOnlyRoot, "claude", "claude-only-session.jsonl", [
    JSON.stringify({
      type: "session",
      id: "agent:claude:acp:33333333-3333-3333-3333-333333333333",
      timestamp: oneMinuteAgo,
    }),
    JSON.stringify({
      type: "message",
      timestamp: oneMinuteAgo,
      message: {
        role: "user",
        content: "[Wed 2026-04-01 23:58 GMT+9] Validate legacy claude session path",
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: thirtySecondsAgo,
      message: {
        role: "assistant",
        model: "claude-sonnet-4-6",
        stopReason: "stop",
        usage: { totalTokens: 111 },
        content: "Claude-only session synced",
      },
    }),
  ]);

  const sessions = readSessions(join(claudeOnlyRoot, "cron"));
  assert.equal(sessions.length, 1, "expected claude-only setup to remain discoverable");
  assert.equal(sessions[0]?.agent, "claude", "claude-only session should still report claude agent");
  assert.equal(
    sessions[0]?.key,
    "agent:claude:acp:33333333-3333-3333-3333-333333333333",
    "session key should remain stable"
  );
} finally {
  cleanupFixture(claudeOnlyRoot);
}

console.log("validate-read-sessions: ok");

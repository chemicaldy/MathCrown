// Progress sync: every finished game session is submitted to the
// recordSession Cloud Function, which re-grades it server-side and is the
// ONLY writer of xp/coins/level/streak. localStorage is a display cache and
// an offline queue — never the source of truth.

const QUEUE_KEY = "mc_pending_sessions_v1";

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const q = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function writeQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, 50)));
  } catch {
    /* storage unavailable — queue is best-effort */
  }
}

async function callRecordSession(payload) {
  if (!window.callFn) throw new Error("functions unavailable");
  return window.callFn("recordSession", payload);
}

/**
 * Submit a finished session. Resolves with the server result
 * ({correct, total, xp, coins, totals}) or null when offline/failed —
 * in which case the payload is queued and retried later.
 * Sessions with unverifiable questions (no ids, e.g. legacy-bank fallback)
 * are not submitted at all.
 */
export async function submitSession(payload) {
  if (!payload.answers || !payload.answers.length) return null;
  if (payload.answers.some((a) => !a.id)) return null;
  try {
    const result = await callRecordSession(payload);
    return result;
  } catch (e) {
    // Client-side rejections (cheating heuristics, bad payload) should not
    // be retried; transient/network failures should.
    const code = e && e.code ? String(e.code) : "";
    if (code.includes("invalid-argument") || code.includes("unauthenticated")
        || code.includes("resource-exhausted") || code.includes("already-exists")) {
      console.warn("Session rejected, not queueing:", code, e.message);
      return null;
    }
    const q = readQueue();
    q.push({ payload, queuedAt: Date.now() });
    writeQueue(q);
    console.warn("Session queued for retry:", e && e.message);
    return null;
  }
}

/** Retry queued sessions (call on login / reconnect). */
export async function flushQueue() {
  const q = readQueue();
  if (!q.length) return { flushed: 0, remaining: 0 };
  const remaining = [];
  let flushed = 0;
  for (const item of q) {
    try {
      await callRecordSession(item.payload);
      flushed++;
    } catch (e) {
      const code = e && e.code ? String(e.code) : "";
      const permanent = code.includes("invalid-argument") || code.includes("already-exists")
        || code.includes("resource-exhausted");
      if (!permanent) remaining.push(item);
    }
  }
  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}

/**
 * One-time migration of progress earned under the old localStorage-only
 * client. Server caps the accepted values (localStorage is forgeable).
 */
export async function migrateLegacyProgress(totals) {
  try {
    return await window.callFn("migrateLegacyProgress", totals);
  } catch (e) {
    console.warn("Legacy migration skipped:", e && e.message);
    return null;
  }
}

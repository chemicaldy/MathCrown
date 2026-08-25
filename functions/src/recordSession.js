import { onCall, HttpsError } from "firebase-functions/v2/https";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, FieldValue, Timestamp } from "./admin.js";
import { computeAward, levelFor, nextStreak, dayKey } from "./scoring.js";

// Loaded once per instance, not per request.
const ANSWER_MAP = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../data/answer-map.json"), "utf8")
);

const MODES = new Set(["trivia", "practice", "battle"]);
const MAX_ANSWERS = 20;
const MIN_MS_PER_QUESTION = 1500;
const MAX_SESSION_MS = 3 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_HOUR = 30;

function validate(data) {
  if (!data || typeof data !== "object") throw new HttpsError("invalid-argument", "Missing payload.");
  const { mode, answers, durationMs, battleId } = data;
  if (!MODES.has(mode)) throw new HttpsError("invalid-argument", "Unknown mode.");
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > MAX_ANSWERS) {
    throw new HttpsError("invalid-argument", "answers must contain 1-" + MAX_ANSWERS + " entries.");
  }
  const seen = new Set();
  for (const a of answers) {
    if (!a || typeof a.id !== "string" || a.id.length > 80 || !Number.isInteger(a.sel) || a.sel < -1 || a.sel > 3) {
      throw new HttpsError("invalid-argument", "Malformed answer entry.");
    }
    if (seen.has(a.id)) throw new HttpsError("invalid-argument", "Duplicate question in session.");
    seen.add(a.id);
  }
  if (typeof durationMs !== "number" || durationMs < answers.length * MIN_MS_PER_QUESTION || durationMs > MAX_SESSION_MS) {
    throw new HttpsError("invalid-argument", "Implausible session duration.");
  }
  if (battleId !== undefined && (typeof battleId !== "string" || battleId.length > 120)) {
    throw new HttpsError("invalid-argument", "Bad battleId.");
  }
  return { mode, answers, durationMs, battleId };
}

// Grades a session server-side and applies XP/coins transactionally.
// The client never writes progress fields itself (rules deny it).
export const recordSession = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in to record progress.");
  const uid = req.auth.uid;
  const { mode, answers, durationMs, battleId } = validate(req.data);

  // Grade against the server's own copy of the bank.
  let correct = 0;
  for (const a of answers) {
    const c = ANSWER_MAP[a.id];
    if (c === undefined) throw new HttpsError("invalid-argument", "Unknown question id: " + a.id);
    if (a.sel === c) correct++;
  }
  const total = answers.length;

  // Rate limit: sessions recorded in the last hour.
  const hourAgo = Timestamp.fromMillis(Date.now() - 3600000);
  const recent = await db
    .collection("users").doc(uid).collection("sessions")
    .where("createdAt", ">", hourAgo)
    .count().get();
  if (recent.data().count >= MAX_SESSIONS_PER_HOUR) {
    throw new HttpsError("resource-exhausted", "Too many sessions this hour — take a break!");
  }

  // Battle outcome is only trusted when a server-side battle doc backs it up.
  let battleOutcome = null;
  let wonBattle = false;
  if (mode === "battle" && battleId) {
    const battleSnap = await db.collection("battles").doc(battleId).get();
    if (!battleSnap.exists) throw new HttpsError("not-found", "Battle not found.");
    const b = battleSnap.data();
    const isP1 = b.p1Uid === uid;
    if (!isP1 && b.p2Uid !== uid) throw new HttpsError("permission-denied", "Not your battle.");
    if (b.status !== "finished") throw new HttpsError("failed-precondition", "Battle not finished.");
    if ((isP1 && b.p1Recorded) || (!isP1 && b.p2Recorded)) {
      throw new HttpsError("already-exists", "Battle already recorded.");
    }
    const mine = isP1 ? (b.p1Score || 0) : (b.p2Score || 0);
    const theirs = isP1 ? (b.p2Score || 0) : (b.p1Score || 0);
    battleOutcome = mine > theirs ? "win" : mine === theirs ? "tie" : "loss";
    wonBattle = battleOutcome === "win";
    await battleSnap.ref.update(isP1 ? { p1Recorded: true } : { p2Recorded: true });
  }

  const award = computeAward(mode, correct, total, battleOutcome);
  const now = new Date();

  const userRef = db.collection("users").doc(uid);
  const lbRef = db.collection("leaderboard").doc(uid);
  const sessionRef = userRef.collection("sessions").doc();

  const totals = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "No user profile.");
    const u = userSnap.data();
    const xp = (u.xp || 0) + award.xp;
    const coins = (u.coins || 0) + award.coins;
    const level = levelFor(xp);
    const streak = nextStreak(u.streak, u.lastPlayedDay, now);
    const wins = (u.wins || 0) + (wonBattle ? 1 : 0);
    tx.update(userRef, { xp, coins, level, streak, wins, lastPlayedDay: dayKey(now) });
    tx.set(lbRef, {
      name: u.displayName || u.name || "Player",
      grade: u.grade || "",
      xp, level, wins,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(sessionRef, {
      mode, correct, total, durationMs,
      xp: award.xp, coins: award.coins,
      battleId: battleId || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { xp, coins, level, streak, wins };
  });

  return { correct, total, xp: award.xp, coins: award.coins, totals };
});

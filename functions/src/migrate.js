import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin.js";
import { levelFor } from "./scoring.js";

// One-shot import of progress a player earned under the old localStorage-only
// client. localStorage is forgeable, so claims are capped and only accepted
// into an account that has never recorded server-side progress.
const MAX_LEGACY_XP = 15000;
const MAX_LEGACY_COINS = 3000;
const MAX_LEGACY_STREAK = 60;

export const migrateLegacyProgress = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid;
  const data = req.data || {};
  const xp = Math.min(Math.max(0, Math.floor(Number(data.xp) || 0)), MAX_LEGACY_XP);
  const coins = Math.min(Math.max(0, Math.floor(Number(data.coins) || 0)), MAX_LEGACY_COINS);
  const streak = Math.min(Math.max(0, Math.floor(Number(data.streak) || 0)), MAX_LEGACY_STREAK);

  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "No user profile.");
    const u = snap.data();
    if (u.migratedLegacy) throw new HttpsError("already-exists", "Legacy progress already migrated.");
    if ((u.xp || 0) > 0) throw new HttpsError("failed-precondition", "Account already has server progress.");
    const level = levelFor(xp);
    tx.update(userRef, { xp, coins, streak, level, migratedLegacy: true });
    tx.set(db.collection("leaderboard").doc(uid), {
      name: u.displayName || u.name || "Player",
      grade: u.grade || "",
      xp, level, wins: u.wins || 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { xp, coins, streak, level };
  });
});

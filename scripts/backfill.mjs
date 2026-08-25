// One-time production backfill for accounts created under the legacy client.
// Run by an operator with a service-account key (never in CI):
//
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/backfill.mjs [--dry-run]
//
// What it does, per `users` doc:
//   1. Assigns a linkCode (+ linkCodes/{code} doc) to students missing one —
//      the legacy client generated codes in-memory that never persisted.
//   2. Seeds/refreshes the leaderboard mirror for students.
//   3. Removes any legacy `plan` field from users docs — entitlements now
//      live in entitlements/{uid} written only by the Stripe webhook, and no
//      legitimate paid users exist (the old checkout never charged anyone).
//   4. Tolerates missing fields (docs written by several old client versions).
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DRY = process.argv.includes("--dry-run");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function uniqueLinkCode(taken) {
  for (let i = 0; i < 20; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (taken.has(code)) continue;
    const snap = await db.collection("linkCodes").doc(code).get();
    if (!snap.exists) { taken.add(code); return code; }
  }
  throw new Error("could not allocate link code");
}

const takenCodes = new Set();
let scanned = 0, codesAssigned = 0, lbSeeded = 0, plansCleared = 0;

const users = await db.collection("users").get();
for (const docSnap of users.docs) {
  scanned++;
  const u = docSnap.data();
  const uid = docSnap.id;
  const role = u.role || "student";
  const updates = {};

  if (role === "student" && !u.linkCode) {
    const code = await uniqueLinkCode(takenCodes);
    updates.linkCode = code;
    codesAssigned++;
    if (!DRY) {
      await db.collection("linkCodes").doc(code).set({ uid, createdAt: FieldValue.serverTimestamp() });
    }
  } else if (u.linkCode) {
    takenCodes.add(String(u.linkCode));
    if (!DRY) {
      await db.collection("linkCodes").doc(String(u.linkCode)).set(
        { uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  if (u.plan !== undefined) {
    updates.plan = FieldValue.delete();
    plansCleared++;
  }

  if (Object.keys(updates).length && !DRY) await docSnap.ref.update(updates);

  if (role === "student") {
    lbSeeded++;
    if (!DRY) {
      await db.collection("leaderboard").doc(uid).set({
        name: u.displayName || u.name || "Player",
        grade: u.grade || "",
        xp: u.xp || 0,
        level: u.level || 1,
        wins: u.wins || 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
}

console.log(`${DRY ? "[DRY RUN] " : ""}scanned=${scanned} linkCodesAssigned=${codesAssigned} leaderboardSeeded=${lbSeeded} legacyPlansCleared=${plansCleared}`);

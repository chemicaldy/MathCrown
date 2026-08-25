import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, FieldValue, Timestamp } from "./admin.js";

async function uniqueLinkCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const snap = await db.collection("linkCodes").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new Error("Could not allocate a unique link code");
}

// Seeds every new student profile with a persisted linkCode (the old client
// generated one in-memory that never reached Firestore, breaking parent
// linking) and a leaderboard mirror row.
export const onUserCreated = onDocumentCreated("users/{uid}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const uid = event.params.uid;
  const u = snap.data();

  const updates = {};
  if (!u.linkCode) {
    const code = await uniqueLinkCode();
    await db.collection("linkCodes").doc(code).set({ uid, createdAt: FieldValue.serverTimestamp() });
    updates.linkCode = code;
  } else {
    await db.collection("linkCodes").doc(String(u.linkCode)).set(
      { uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (Object.keys(updates).length) await snap.ref.update(updates);

  if ((u.role || "student") === "student") {
    await db.collection("leaderboard").doc(uid).set({
      name: u.displayName || u.name || "Player",
      grade: u.grade || "",
      xp: u.xp || 0,
      level: u.level || 1,
      wins: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
});

async function deleteWhere(query) {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) return deleted;
  }
}

// Sweeps zombie state the client may leave behind (cancelled challenges whose
// docs were orphaned, stale presence rows, finished battles).
export const cleanupStale = onSchedule("every 24 hours", async () => {
  const now = Date.now();
  const challenges = await deleteWhere(
    db.collection("challenges").where("createdAt", "<", Timestamp.fromMillis(now - 10 * 60 * 1000)));
  const presence = await deleteWhere(
    db.collection("presence").where("lastSeen", "<", Timestamp.fromMillis(now - 60 * 60 * 1000)));
  const battles = await deleteWhere(
    db.collection("battles").where("createdAt", "<", Timestamp.fromMillis(now - 7 * 24 * 60 * 60 * 1000)));
  console.log(`cleanupStale: challenges=${challenges} presence=${presence} battles=${battles}`);
});

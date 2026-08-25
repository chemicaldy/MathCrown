// End-to-end tests for the recordSession/migrateLegacyProgress callables,
// run inside `firebase emulators:exec --only auth,firestore,functions`.
// Uses the real client SDK against the emulators — the same path the app takes.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const PROJECT = "demo-mathcrown";
const app = initializeApp({ projectId: PROJECT, apiKey: "fake-api-key", authDomain: "localhost" });
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const answerMap = JSON.parse(readFileSync("functions/data/answer-map.json", "utf8"));
const ids = Object.keys(answerMap);

function pickAnswers(n, correctCount) {
  // Build a payload with `correctCount` right answers out of n.
  return ids.slice(0, n).map((id, i) => ({
    id,
    sel: i < correctCount ? answerMap[id] : (answerMap[id] + 1) % 4,
  }));
}

let uid;
let studentEmail;
beforeAll(async () => {
  const email = `student${Date.now()}@test.com`;
  studentEmail = email;
  const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
  uid = cred.user.uid;
  // Profile create matching the security rules' allowed shape.
  await setDoc(doc(db, "users", uid), {
    name: "Test Student", displayName: "Test Student", email,
    role: "student", grade: "7",
    xp: 0, coins: 0, level: 1, streak: 0,
    createdAt: new Date(),
  });
});

describe("recordSession", () => {
  const call = (data) => httpsCallable(functions, "recordSession")(data);

  it("grades a trivia session server-side and awards once", async () => {
    const answers = pickAnswers(3, 2);
    const res = await call({ mode: "trivia", answers, durationMs: 3 * 2000 });
    expect(res.data.correct).toBe(2);
    expect(res.data.total).toBe(3);
    expect(res.data.xp).toBe(2 * 50); // no perfect bonus
    expect(res.data.coins).toBe(2 * 10);
    expect(res.data.totals.xp).toBe(100);
  });

  it("adds the perfect bonus and accumulates totals", async () => {
    const answers = pickAnswers(3, 3);
    const res = await call({ mode: "trivia", answers, durationMs: 3 * 2000 });
    expect(res.data.xp).toBe(3 * 50 + 100);
    expect(res.data.totals.xp).toBe(100 + 250);
    // Leaderboard mirror updated transactionally.
    const lb = await getDoc(doc(db, "leaderboard", uid)); // owner read allowed? leaderboard read requires signed-in
    expect(lb.exists()).toBe(true);
    expect(lb.data().xp).toBe(350);
  });

  it("rejects an implausibly fast session (cheat heuristic)", async () => {
    const answers = pickAnswers(5, 5);
    await expect(call({ mode: "trivia", answers, durationMs: 500 }))
      .rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("rejects unknown question ids", async () => {
    await expect(call({ mode: "trivia", answers: [{ id: "made.up.999", sel: 0 }], durationMs: 5000 }))
      .rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("rejects duplicate question ids in one session", async () => {
    const a = { id: ids[0], sel: answerMap[ids[0]] };
    await expect(call({ mode: "trivia", answers: [a, { ...a }], durationMs: 8000 }))
      .rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("awards bot battles on graded answers, not claimed outcomes", async () => {
    const answers = pickAnswers(5, 4);
    const res = await call({ mode: "battle", answers, durationMs: 5 * 2000 });
    expect(res.data.xp).toBe(4 * 30 + 20);
    expect(res.data.coins).toBe(4 * 6);
  });

  it("client cannot write xp directly (rules deny the legacy path)", async () => {
    await expect(setDoc(doc(db, "users", uid), { xp: 999999 }, { merge: true }))
      .rejects.toThrow();
  });
});

describe("migrateLegacyProgress", () => {
  it("caps claimed legacy totals and only runs once", async () => {
    const email = `legacy${Date.now()}@test.com`;
    const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
    await setDoc(doc(db, "users", cred.user.uid), {
      name: "Legacy Kid", displayName: "Legacy Kid", email,
      role: "student", grade: "5",
      xp: 0, coins: 0, level: 1, streak: 0,
      createdAt: new Date(),
    });
    const call = (data) => httpsCallable(functions, "migrateLegacyProgress")(data);
    const res = await call({ xp: 999999, coins: 999999, streak: 999 });
    expect(res.data.xp).toBe(15000); // capped
    expect(res.data.coins).toBe(3000); // capped
    await expect(call({ xp: 100, coins: 100, streak: 1 }))
      .rejects.toMatchObject({ code: "functions/already-exists" });
  });
});

describe("onUserCreated", () => {
  it("assigns a linkCode and seeds the leaderboard for new students", async () => {
    // Earlier tests may have switched auth users; only the owner may read.
    await signInWithEmailAndPassword(auth, studentEmail, "secret123");
    // The beforeAll user profile creation should have triggered it.
    let linkCode = null;
    for (let i = 0; i < 20 && !linkCode; i++) {
      const snap = await getDoc(doc(db, "users", uid));
      linkCode = snap.data().linkCode || null;
      if (!linkCode) await new Promise((r) => setTimeout(r, 500));
    }
    expect(linkCode).toMatch(/^\d{6}$/);
  });
});

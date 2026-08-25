// askTutor emulator tests: demo mode (no ANTHROPIC_API_KEY secret in the
// emulator) and the per-user daily rate limit.
import { describe, it, expect, beforeAll } from "vitest";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const PROJECT = "demo-mathcrown";
const app = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: PROJECT, apiKey: "fake-api-key", authDomain: "localhost" });
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
try { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch { /* already connected */ }
try { connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch { /* already connected */ }
try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch { /* already connected */ }

const call = (data) => httpsCallable(functions, "askTutor")(data);

beforeAll(async () => {
  const email = `tutor${Date.now()}@test.com`;
  const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
  await setDoc(doc(db, "users", cred.user.uid), {
    name: "Tutor Kid", displayName: "Tutor Kid", email,
    role: "student", grade: "6",
    xp: 0, coins: 0, level: 1, streak: 0, createdAt: new Date(),
  });
});

describe("askTutor", () => {
  it("answers in demo mode when no server key is configured", async () => {
    const res = await call({ message: "What is 2+2?", grade: 6, name: "Kid", history: [] });
    expect(res.data.reply).toBeTruthy();
    expect(res.data.demo).toBe(true);
  });

  it("rejects empty messages", async () => {
    await expect(call({ message: "   " }))
      .rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("enforces the daily per-user limit", async () => {
    // 1 call used above; burn through the rest of the 30-a-day allowance.
    for (let i = 0; i < 29; i++) {
      await call({ message: `q${i}`, grade: 6 });
    }
    await expect(call({ message: "one too many", grade: 6 }))
      .rejects.toMatchObject({ code: "functions/resource-exhausted" });
  }, 120000);
});

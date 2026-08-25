// createParentAccount + linkChild end-to-end against the emulators.
import { describe, it, expect } from "vitest";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc,
  collection, query, where, getDocs,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const PROJECT = "demo-mathcrown";
const app = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: PROJECT, apiKey: "fake-api-key", authDomain: "localhost" });
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
try { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch { /* connected */ }
try { connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch { /* connected */ }
try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch { /* connected */ }

async function makeStudent(name) {
  const email = `kid${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
  await setDoc(doc(db, "users", cred.user.uid), {
    name, displayName: name, email, role: "student", grade: "4",
    xp: 0, coins: 0, level: 1, streak: 0, createdAt: new Date(),
  });
  // Wait for onUserCreated to assign the linkCode.
  let linkCode = null;
  for (let i = 0; i < 20 && !linkCode; i++) {
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    linkCode = snap.exists() ? snap.data().linkCode || null : null;
    if (!linkCode) await new Promise((r) => setTimeout(r, 500));
  }
  return { uid: cred.user.uid, email, linkCode };
}

describe("parent accounts & child linking", () => {
  it("provisions a parent (role claim + profile) and links a child by code", async () => {
    // Student first (also verifies linkCode assignment).
    const student = await makeStudent("Linkable Kid");
    expect(student.linkCode).toMatch(/^\d{6}$/);

    // Parent: bare Auth user, then server-side provisioning.
    const parentEmail = `parent${Date.now()}@test.com`;
    await createUserWithEmailAndPassword(auth, parentEmail, "secret123");
    await httpsCallable(functions, "createParentAccount")({ name: "Pat Parent" });
    // Refresh token → role claim live.
    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    expect(tokenResult.claims.role).toBe("parent");
    const parentUid = auth.currentUser.uid;
    const profile = await getDoc(doc(db, "users", parentUid));
    expect(profile.data().role).toBe("parent");

    // Link by code.
    const res = await httpsCallable(functions, "linkChild")({ code: student.linkCode });
    expect(res.data.name).toBe("Linkable Kid");

    // The parent can now read/query the child.
    const kids = await getDocs(query(collection(db, "users"), where("parentUid", "==", parentUid)));
    expect(kids.docs.map((d) => d.id)).toContain(student.uid);

    // A second parent cannot claim the same child.
    const parent2Email = `parent2${Date.now()}@test.com`;
    await createUserWithEmailAndPassword(auth, parent2Email, "secret123");
    await httpsCallable(functions, "createParentAccount")({ name: "Other Parent" });
    await auth.currentUser.getIdTokenResult(true);
    await expect(httpsCallable(functions, "linkChild")({ code: student.linkCode }))
      .rejects.toMatchObject({ code: "functions/already-exists" });

    // Re-linking by the SAME parent is idempotent (sign back in as parent 1).
    await signInWithEmailAndPassword(auth, parentEmail, "secret123");
    const again = await httpsCallable(functions, "linkChild")({ code: student.linkCode });
    expect(again.data.childUid).toBe(student.uid);
  }, 60000);

  it("rejects linkChild from student accounts and bad codes", async () => {
    const student = await makeStudent("Solo Kid");
    // Still signed in as the student from makeStudent.
    await expect(httpsCallable(functions, "linkChild")({ code: student.linkCode }))
      .rejects.toMatchObject({ code: "functions/permission-denied" });
    // Parent with a nonexistent code.
    await createUserWithEmailAndPassword(auth, `parent3${Date.now()}@test.com`, "secret123");
    await httpsCallable(functions, "createParentAccount")({ name: "Code Tester" });
    await expect(httpsCallable(functions, "linkChild")({ code: "000000" }))
      .rejects.toMatchObject({ code: "functions/not-found" });
  }, 60000);
});

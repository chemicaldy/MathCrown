import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { db, FieldValue } from "./admin.js";

const NAME_RE = /^[^<>]{1,30}$/;

// Turns a freshly created Auth user into a parent account: sets the `parent`
// role as a custom claim and creates the profile doc via the Admin SDK
// (security rules only allow self-service creation of *student* docs).
// The old "parent signup" never created any account at all — it wrote a
// localStorage flag, discarded the password, and granted paid plans free.
export const createParentAccount = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Create your login first.");
  const uid = req.auth.uid;
  const name = typeof req.data?.name === "string" ? req.data.name.trim() : "";
  if (!NAME_RE.test(name)) throw new HttpsError("invalid-argument", "Please provide your name.");

  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (snap.exists && snap.data().role === "student") {
    throw new HttpsError("failed-precondition", "This email already has a student account.");
  }
  await getAuth().setCustomUserClaims(uid, { role: "parent" });
  await userRef.set({
    name,
    displayName: name,
    email: req.auth.token.email || "",
    role: "parent",
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

// Links a child to the calling parent using the child's permanent 6-digit
// linkCode (assigned server-side at student signup).
export const linkChild = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid;
  const code = typeof req.data?.code === "string" ? req.data.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code from your child's profile.");

  const callerSnap = await db.collection("users").doc(uid).get();
  if (!callerSnap.exists || callerSnap.data().role !== "parent") {
    throw new HttpsError("permission-denied", "Only parent accounts can link children.");
  }

  const codeSnap = await db.collection("linkCodes").doc(code).get();
  if (!codeSnap.exists) throw new HttpsError("not-found", "That code doesn't match any student. Double-check and try again.");
  const childUid = codeSnap.data().uid;

  const childRef = db.collection("users").doc(childUid);
  return db.runTransaction(async (tx) => {
    const child = await tx.get(childRef);
    if (!child.exists || (child.data().role || "student") !== "student") {
      throw new HttpsError("not-found", "That code doesn't match any student.");
    }
    const existing = child.data().parentUid;
    if (existing && existing !== uid) {
      throw new HttpsError("already-exists", "That student is already linked to another parent account.");
    }
    tx.update(childRef, { parentUid: uid });
    return {
      childUid,
      name: child.data().displayName || child.data().name || "Student",
      grade: child.data().grade || "",
    };
  });
});

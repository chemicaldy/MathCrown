// Stripe webhook + checkout gating tests against the emulator.
// The signature is constructed exactly as Stripe's `stripe-signature` header
// (t=<ts>,v1=HMAC_SHA256(`${ts}.${payload}`)) using the dummy secret from
// functions/.secret.local, so stripe.webhooks.constructEvent verifies it.
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const PROJECT = "demo-mathcrown";
const WEBHOOK_URL = `http://127.0.0.1:5001/${PROJECT}/us-central1/stripeWebhook`;
const WEBHOOK_SECRET = "whsec_dummy_local_emulator_secret";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: PROJECT, apiKey: "fake-api-key", authDomain: "localhost" });
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
try { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch { /* connected */ }
try { connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch { /* connected */ }
try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch { /* connected */ }

function stripeSignature(payload, secret, ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function postWebhook(eventObj, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(eventObj);
  return fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": stripeSignature(payload, secret),
    },
    body: payload,
  });
}

describe("billing", () => {
  it("createCheckoutSession reports coming-soon while price IDs are unset", async () => {
    const email = `buyer${Date.now()}@test.com`;
    const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
    await setDoc(doc(db, "users", cred.user.uid), {
      name: "Buyer Kid", displayName: "Buyer Kid", email, role: "student", grade: "8",
      xp: 0, coins: 0, level: 1, streak: 0, createdAt: new Date(),
    });
    // Dummy secret exists but no STRIPE_PRICE_* params → still gated off.
    await expect(httpsCallable(functions, "createCheckoutSession")({ plan: "premium" }))
      .rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("rejects webhooks with a bad signature", async () => {
    const res = await postWebhook({ type: "checkout.session.completed" }, "whsec_wrong");
    expect(res.status).toBe(400);
  });

  it("grants an entitlement + plan claim on a signed checkout.session.completed", async () => {
    const email = `payer${Date.now()}@test.com`;
    const cred = await createUserWithEmailAndPassword(auth, email, "secret123");
    const uid = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      name: "Payer Kid", displayName: "Payer Kid", email, role: "student", grade: "9",
      xp: 0, coins: 0, level: 1, streak: 0, createdAt: new Date(),
    });

    const res = await postWebhook({
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          client_reference_id: uid,
          customer: "cus_test_1",
          subscription: "sub_test_1",
          metadata: { uid, plan: "family" },
        },
      },
    });
    expect(res.status).toBe(200);

    const ent = await getDoc(doc(db, "entitlements", uid));
    expect(ent.exists()).toBe(true);
    expect(ent.data().plan).toBe("family");
    expect(ent.data().status).toBe("active");

    const token = await auth.currentUser.getIdTokenResult(true);
    expect(token.claims.plan).toBe("family");
  });

  it("downgrades the claim when the subscription is deleted", async () => {
    const uid = auth.currentUser.uid; // payer from previous test
    const res = await postWebhook({
      id: "evt_test_2",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_1",
          customer: "cus_test_1",
          status: "canceled",
          metadata: { uid },
          items: { data: [] },
        },
      },
    });
    expect(res.status).toBe(200);
    const token = await auth.currentUser.getIdTokenResult(true);
    expect(token.claims.plan).toBe("free");
    const ent = await getDoc(doc(db, "entitlements", uid));
    expect(ent.data().status).toBe("canceled");
  });
});

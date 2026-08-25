import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import Stripe from "stripe";
import { db, FieldValue } from "./admin.js";

// Secrets are set per-project with `firebase functions:secrets:set ...`.
// Until they exist, checkout reports "coming soon" and NOTHING grants a
// paid plan — the old client granted whichever plan card was clicked, free,
// from localStorage.
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const pricePremium = defineString("STRIPE_PRICE_PREMIUM", { default: "" });
const priceFamily = defineString("STRIPE_PRICE_FAMILY", { default: "" });
const priceMax = defineString("STRIPE_PRICE_MAX", { default: "" });
const checkoutOrigin = defineString("CHECKOUT_ORIGIN", { default: "https://www.mymathcrown.com" });

function priceMap() {
  return {
    premium: pricePremium.value(),
    family: priceFamily.value(),
    max: priceMax.value(),
  };
}

function planForPrice(priceId) {
  const entries = Object.entries(priceMap());
  const hit = entries.find(([, id]) => id && id === priceId);
  return hit ? hit[0] : null;
}

export const createCheckoutSession = onCall({ secrets: [stripeSecretKey] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const planKey = String(req.data?.plan || "").toLowerCase();
  const priceId = priceMap()[planKey];
  const key = stripeSecretKey.value();
  if (!key || !priceId) {
    throw new HttpsError("failed-precondition",
      "Paid plans are coming soon — enjoy MathCrown free for now!");
  }
  const stripe = new Stripe(key);
  const origin = checkoutOrigin.value();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: req.auth.uid,
    customer_email: req.auth.token.email || undefined,
    metadata: { uid: req.auth.uid, plan: planKey },
    success_url: origin + "/?checkout=success",
    cancel_url: origin + "/?checkout=cancelled",
  });
  return { url: session.url };
});

async function applyEntitlement(uid, data) {
  await db.collection("entitlements").doc(uid).set(
    { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const user = await getAuth().getUser(uid).catch(() => null);
  if (user) {
    const claims = user.customClaims || {};
    const active = data.status === "active" || data.status === "trialing";
    await getAuth().setCustomUserClaims(uid, {
      ...claims,
      plan: active ? data.plan : "free",
    });
  }
}

// Stripe is the ONLY writer of entitlements — signature-verified webhook.
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const whSecret = stripeWebhookSecret.value();
    const key = stripeSecretKey.value();
    if (!whSecret || !key) {
      res.status(503).send("Billing not configured");
      return;
    }
    const stripe = new Stripe(key);
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody, req.headers["stripe-signature"], whSecret);
    } catch (e) {
      console.warn("Webhook signature verification failed:", e.message);
      res.status(400).send("Bad signature");
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object;
          const uid = s.client_reference_id || s.metadata?.uid;
          if (!uid) break;
          await applyEntitlement(uid, {
            plan: s.metadata?.plan || "premium",
            status: "active",
            stripeCustomerId: s.customer || null,
            stripeSubscriptionId: s.subscription || null,
          });
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const uid = sub.metadata?.uid
            || (await findUidByCustomer(sub.customer));
          if (!uid) break;
          const status = event.type.endsWith("deleted") ? "canceled" : sub.status;
          const priceId = sub.items?.data?.[0]?.price?.id || null;
          await applyEntitlement(uid, {
            plan: planForPrice(priceId) || "premium",
            status,
            stripeCustomerId: sub.customer || null,
            stripeSubscriptionId: sub.id,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000) : null,
          });
          break;
        }
        default:
          break;
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("Webhook handling failed:", e);
      res.status(500).send("handler error");
    }
  });

async function findUidByCustomer(customerId) {
  if (!customerId) return null;
  const snap = await db.collection("entitlements")
    .where("stripeCustomerId", "==", customerId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

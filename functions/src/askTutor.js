import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./admin.js";
import { dayKey } from "./scoring.js";

// The Anthropic key lives ONLY here, as a server-side secret
// (`firebase functions:secrets:set ANTHROPIC_API_KEY`). The old client called
// api.anthropic.com directly from the browser — which both never worked
// (no key, CORS) and would have published the key to every visitor if it had.
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const tutorModel = defineString("TUTOR_MODEL", { default: "claude-sonnet-5" });

const FREE_DAILY_LIMIT = 30;
const PREMIUM_DAILY_LIMIT = 150;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;

function validate(data) {
  if (!data || typeof data.message !== "string" || !data.message.trim()) {
    throw new HttpsError("invalid-argument", "Ask Axiom a question first!");
  }
  if (data.message.length > MAX_MESSAGE_CHARS) {
    throw new HttpsError("invalid-argument", "That question is a bit long — try a shorter one.");
  }
  const history = [];
  if (Array.isArray(data.history)) {
    for (const turn of data.history.slice(-MAX_HISTORY_TURNS)) {
      if (!turn || (turn.role !== "user" && turn.role !== "assistant")) continue;
      if (typeof turn.content !== "string" || !turn.content.trim()) continue;
      history.push({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_CHARS) });
    }
  }
  const grade = Number.parseInt(data.grade, 10);
  return {
    message: data.message.trim(),
    history,
    grade: grade >= 1 && grade <= 12 ? grade : 7,
    name: typeof data.name === "string" ? data.name.slice(0, 30) : "there",
  };
}

async function enforceDailyLimit(uid, isPremium) {
  const limit = isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const today = dayKey(new Date());
  const ref = db.collection("tutorUsage").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const u = snap.exists ? snap.data() : {};
    const count = u.day === today ? (u.count || 0) : 0;
    if (count >= limit) {
      throw new HttpsError("resource-exhausted",
        "Axiom needs a rest — you've used today's " + limit + " questions. See you tomorrow!");
    }
    tx.set(ref, { day: today, count: count + 1 }, { merge: true });
  });
}

export const askTutor = onCall({ secrets: [anthropicKey] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in to chat with Axiom.");
  const { message, history, grade, name } = validate(req.data);
  const isPremium = !!(req.auth.token && req.auth.token.plan && req.auth.token.plan !== "free");
  await enforceDailyLimit(req.auth.uid, isPremium);

  const key = anthropicKey.value();
  if (!key || process.env.TUTOR_FAKE === "1") {
    // Emulator/demo mode: deterministic canned reply so the feature is
    // testable end-to-end without a real key.
    return {
      reply: "Great question! Let's break it down step by step. " +
        "(Axiom demo mode — the live AI tutor switches on once the server key is configured.)",
      demo: true,
    };
  }

  const client = new Anthropic({ apiKey: key });
  const system =
    "You are Axiom, the friendly AI math coach on MathCrown, a K-12 competitive math platform. " +
    "You are talking to " + name + ", a grade " + grade + " student. " +
    "Explain at their grade level, keep replies to 3-5 sentences, be encouraging, " +
    "and guide them to the answer rather than just stating it. " +
    "Only discuss math and study skills; gently redirect anything else back to math.";

  const response = await client.messages.create({
    model: tutorModel.value(),
    max_tokens: 1000,
    system,
    messages: [...history, { role: "user", content: message }],
  });

  if (response.stop_reason === "refusal") {
    return { reply: "Hmm, I can't help with that one — let's stick to math! What are you working on?" };
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { reply: text || "I'm not sure how to answer that — can you rephrase it?" };
});

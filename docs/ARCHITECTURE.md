# MathCrown Architecture

## Trust model

The single most important rule: **the browser is never trusted with value.**
Progress (XP/coins/level/streak/wins), entitlements (paid plans), roles, and
link codes are written exclusively by Cloud Functions using the Admin SDK.
Firestore security rules (`firestore.rules`, 56-test suite in `tests/rules/`)
deny every client write to those fields; the client's direct-write surface is
limited to its own cosmetic profile fields, its presence heartbeat, and the
challenge/battle documents it participates in.

This replaced a legacy client that wrote its own `xp/coins/plan/role` to
Firestore, granted paid plans from `localStorage`, and rendered other users'
display names into `innerHTML` unescaped.

## Client (`index.html` + `src/`)

- `index.html` — static markup shell (~1,350 lines; was a 5,303-line
  monolith with all CSS/JS inline)
- `src/main.js` — entry; imports styles, app logic, firebase-init
- `src/app.js` — UI/state logic bridged onto `window` for the HTML's inline
  event handlers (progressively shrinking)
- `src/firebase-init.js` — Firebase SDK setup (env-driven config, emulator
  wiring), auth helpers, presence, challenges, battles, leaderboard listener,
  `window.callFn` callable helper
- `src/data/bank-loader.js` — loads the validated JSON bank; answer checks
  compare by value, not index
- `src/data/progress.js` — session submission to `recordSession` with an
  offline retry queue; localStorage is a display cache only

## Firestore data model

| Collection | Written by | Read by |
|---|---|---|
| `users/{uid}` | client: displayName/name/grade/avatar only; functions: everything else | owner, linked parent |
| `users/{uid}/sessions/{sid}` | functions | owner, linked parent |
| `presence/{uid}` | owner (name must match profile, serverTimestamp heartbeat) | signed-in users |
| `challenges/{toUid}` and `{fromUid}_notify` | sender creates, recipient flips status, either deletes | participants |
| `battles/{battleId}` | participants (seats immutable) | participants |
| `leaderboard/{uid}` | functions (mirror) | signed-in users |
| `entitlements/{uid}` | Stripe webhook function | owner, linked parent |
| `linkCodes/{code}` | functions | functions only |
| `tutorUsage/{uid}` | functions | owner |
| `waitlist/{id}` | signed-in create-only | nobody |

## Cloud Functions (`functions/`)

| Function | Type | Purpose |
|---|---|---|
| `recordSession` | callable | Re-grades a finished session against `functions/data/answer-map.json`, applies anti-cheat heuristics (min 1.5s/question, dedupe, 30 sessions/hour), and transactionally updates user totals + leaderboard + session history. PvP battles pass a `battleId`; the outcome bonus is read from the finished battle doc, never from client claims. |
| `onUserCreated` | Firestore trigger | Assigns the permanent 6-digit linkCode and seeds the leaderboard mirror. |
| `cleanupStale` | scheduled (24h) | Sweeps zombie challenges, stale presence, old battles. |
| `migrateLegacyProgress` | callable | One-shot, capped import of pre-rebuild localStorage progress. |
| `askTutor` | callable | Anthropic proxy for the Axiom tutor. `ANTHROPIC_API_KEY` secret, per-uid daily limits in `tutorUsage`, grade-aware system prompt, demo mode when no key. |
| `createParentAccount` | callable | Sets the `parent` role claim and provisions the parent profile doc. |
| `linkChild` | callable | Consumes a linkCode to set `users/{child}.parentUid` (idempotent per parent; refuses cross-parent claims). |
| `createCheckoutSession` | callable | Stripe Checkout (subscription mode). Answers `failed-precondition` ("coming soon") until `STRIPE_SECRET_KEY` + price IDs are configured. |
| `stripeWebhook` | HTTPS | Signature-verified; writes `entitlements/{uid}` and sets/clears the `plan` custom claim. The only entitlement writer in the system. |

## Progress flow

1. Client plays a session; answers (question ids + selected index) are
   recorded locally with timestamps.
2. On completion the client applies an optimistic local update for instant
   feedback and calls `recordSession`.
3. The server re-grades, applies caps/limits, updates
   `users/{uid}` + `leaderboard/{uid}` + `sessions` transactionally, and
   returns authoritative totals, which the client reconciles into the UI.
4. Offline sessions queue in localStorage and flush on next login.

## Entitlement flow

Stripe Checkout → `checkout.session.completed` webhook → `entitlements/{uid}`
doc + `plan` custom claim → client reads the claim from its ID token
(`getIdTokenResult`). Subscription updates/cancellations adjust or clear the
claim. Nothing client-side can mint a plan.

## Environments

| | Staging | Production |
|---|---|---|
| Firebase project | `mathcrown-staging` | `mathchamp-adbd6` |
| Vite mode / env file | `--mode staging` / `.env.staging` | `--mode production` / `.env.production` |
| Deploy trigger | push to `main` | `v*` tag or manual, behind GitHub environment approval |

Local development runs entirely against the Firebase emulator suite
(`.env.development`, `VITE_USE_EMULATORS=true`).

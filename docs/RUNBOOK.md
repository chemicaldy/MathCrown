# MathCrown Operations Runbook

Everything here is a manual, operator-performed step. Nothing in this file
runs automatically.

## 1. One-time environment setup

### 1.1 Firebase projects

1. **Production** is the existing `mathchamp-adbd6` (it holds all current
   Auth users and Firestore data — do not create a fresh project for prod).
2. **Staging:** create a new Firebase project named `mathcrown-staging`
   (must match `.firebaserc`; if you pick another ID, update `.firebaserc`
   and `.github/workflows/ci.yml`).
3. In **both** projects: enable **Email/Password** sign-in (Authentication →
   Sign-in method) and create a **Firestore** database (production mode).
4. Upgrade **both** projects to the **Blaze** plan (required for Cloud
   Functions; cost at current scale rounds to ~$0/month).

### 1.2 Web app configs

In each project: Project settings → Your apps → Add web app. Copy the config
values into `.env.staging` / `.env.production` (`VITE_FIREBASE_*`). These are
public identifiers, safe to commit.

### 1.3 CI service accounts and GitHub secrets

For each project: Project settings → Service accounts → Generate new private
key. In the GitHub repo settings add secrets:

- `FIREBASE_SERVICE_ACCOUNT_STAGING` — the staging JSON, verbatim
- `FIREBASE_SERVICE_ACCOUNT_PROD` — the production JSON, verbatim

Then create GitHub **environments** `staging` and `production`
(Settings → Environments) and give `production` **required reviewers** so
prod deploys need an approval click.

### 1.4 Function secrets (when ready — the app runs fine without them)

```bash
# Axiom tutor (per project):
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY --project staging
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY --project production

# Stripe (per project, once products exist):
npx firebase-tools functions:secrets:set STRIPE_SECRET_KEY --project production
npx firebase-tools functions:secrets:set STRIPE_WEBHOOK_SECRET --project production
```

Until these exist: Axiom answers in labeled demo mode, and paid plans show
"coming soon" with nothing granting premium.

### 1.5 Stripe (optional, later)

1. Create Products/Prices for Premium, Family, Max (monthly subscriptions).
2. Set the price IDs as function params (`.env` files in `functions/` or
   `firebase functions:config` equivalents): `STRIPE_PRICE_PREMIUM`,
   `STRIPE_PRICE_FAMILY`, `STRIPE_PRICE_MAX`, plus `CHECKOUT_ORIGIN`.
3. Add a webhook endpoint in the Stripe dashboard pointing at the deployed
   `stripeWebhook` URL (shown by `firebase deploy`), subscribing to
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.

## 2. Deploys

- **Staging:** merge to `main` → `deploy-staging.yml` deploys functions,
  rules, indexes, and hosting to `mathcrown-staging`. Smoke-test at
  `https://mathcrown-staging.web.app`.
- **Production:** tag `vX.Y.Z` (or run the workflow manually) → approval →
  deploy to `mathchamp-adbd6`.

Manual equivalent:

```bash
npm run build:staging   # or build:production
npx firebase-tools deploy --only functions,firestore:rules,firestore:indexes,hosting --project staging
```

## 3. Production cutover (GitHub Pages → Firebase Hosting)

The old static site on GitHub Pages writes directly to Firestore; the new
rules break it. Order matters — follow exactly:

1. **Deploy everything to production Firebase** (functions + rules + indexes
   + hosting) via the production workflow. DNS still points at GitHub Pages,
   so the old site keeps working until step 5 — but note: once the new RULES
   are live, the old site's direct progress writes start failing (reads still
   work). Keep the gap between this step and step 5 short.
2. **Backfill:** download a prod service-account key and run
   `GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/backfill.mjs --dry-run`,
   review the counts, then run without `--dry-run`. This assigns missing
   linkCodes, seeds the leaderboard, and clears legacy client-written `plan`
   fields (no legitimate paid users exist — the old checkout never charged).
3. **Smoke-test the new site** at `https://mathchamp-adbd6.web.app`:
   sign up, play a trivia round, confirm XP appears on the leaderboard,
   log out/in, link a child from a parent account.
4. **Custom domain:** Firebase Hosting → Add custom domain →
   `www.mymathcrown.com` (+ apex). Add the TXT verification record, then the
   A/AAAA records Firebase shows, at the DNS registrar. Wait for the cert
   (minutes to a few hours).
5. **Flip:** once Firebase serves the domain, disable GitHub Pages on the
   repo and delete `CNAME` in a follow-up commit.
6. **Two weeks later:** optionally delete `question_bank.js` from the repo
   root (kept only for stragglers' cached old HTML that still pulls the
   jsDelivr URL).

## 4. Rollback

- **Hosting:** Firebase console → Hosting → Release history → Rollback
  (instant).
- **Functions:** redeploy the previous tag
  (`git checkout vPREV && npx firebase-tools deploy --only functions --project production`).
- **Rules:** previous versions are in the Firebase console rules history;
  or `git checkout vPREV -- firestore.rules` and deploy `--only firestore:rules`.

## 5. Routine operations

- **Emulator suite locally:** `npm run emulators` + `npm run dev`.
- **Stale emulator ports** (`port taken` errors): `pkill -f emulators:exec`,
  `pkill -f cloud-firestore-emulator`.
- **Question bank edits:** never edit `data/question_bank.json` by hand —
  change the scripts, re-run the pipeline
  (`bank:convert` → `bank:fix` → `bank:validate` → `build-answer-map`), and
  commit the regenerated files; CI enforces freshness.
- **Abuse/limits tuning:** rate limits live in
  `functions/src/recordSession.js` (30 sessions/hour) and
  `functions/src/askTutor.js` (30/day free, 150/day premium).

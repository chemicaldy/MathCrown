# MathCrown

K-12 competitive math platform — live math duels, XP and MathCoins, an AI
tutor (Axiom), and parent dashboards. Deployed at
[mymathcrown.com](https://www.mymathcrown.com).

## Stack

- **Frontend:** Vite + vanilla JS (`index.html` + `src/`), Firebase Web SDK
- **Backend:** Firebase — Auth, Firestore, Cloud Functions (Node 20)
- **Environments:** `mathcrown-staging` (staging) and `mathchamp-adbd6`
  (production), selected via `.firebaserc` aliases + `.env.staging` /
  `.env.production` Vite modes
- **Payments:** Stripe Checkout + webhook → `entitlements` collection +
  `plan` custom claim (gated off until Stripe secrets are configured)
- **AI tutor:** `askTutor` Cloud Function proxying the Anthropic API
  (server-side key, per-user daily limits)

## Getting started

```bash
npm install
cd functions && npm install && cd ..

# Terminal 1 — Firebase emulators (Auth, Firestore, Functions, Hosting)
npm run emulators

# Terminal 2 — dev server against the emulators (.env.development)
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server / production build / preview |
| `npm run build:staging` / `build:production` | Environment-specific builds |
| `npm run lint` | ESLint over app, functions, scripts, tests |
| `npm test` | Unit tests (question bank invariants, regressions) |
| `npm run test:rules` | Firestore security-rules suite (emulator) |
| `npm run test:functions` | Cloud Functions integration suite (emulators) |
| `npm run smoke` | Headless-Chromium smoke test against the built site |
| `npm run bank:convert` → `bank:fix` → `bank:validate` → `bank:report` | Question-bank data pipeline |
| `node scripts/build-answer-map.mjs` | Regenerates the functions grading map |
| `node scripts/backfill.mjs --dry-run` | Ops: legacy-account backfill (see RUNBOOK) |

## Question bank

`question_bank.js` (repo root) is the frozen legacy source. The app uses
`data/question_bank.json`, produced by the pipeline in `scripts/`, which
fixed 55 wrong answers, removed 646 duplicate questions, and regenerated
1,690 duplicate answer options. `functions/data/answer-map.json` is the
trimmed `id → correct index` map the server grades against. CI fails if the
generated files are stale.

## Architecture & operations

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, trust
  boundaries, function inventory
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — environment setup, secrets, deploys,
  the GitHub Pages → Firebase Hosting cutover, rollback

## CI/CD

- `ci.yml` — every PR: lint, bank validation, unit + rules + functions
  tests, build, XSS grep gate, browser smoke (+ optional Hosting preview)
- `deploy-staging.yml` — push to `main` → staging project
- `deploy-production.yml` — `v*` tag or manual dispatch → production, behind
  a GitHub environment approval

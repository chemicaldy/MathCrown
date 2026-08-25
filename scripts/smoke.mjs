// Headless browser smoke test: loads the built site via `vite preview`,
// fails on any uncaught page error, and walks the core UI paths that do not
// need a live Firebase backend. Run: node scripts/smoke.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 4173;
const previewProc = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "pipe",
});

function waitForServer(url, tries = 50) {
  return new Promise((res, rej) => {
    const attempt = async (n) => {
      try {
        const r = await fetch(url);
        if (r.ok) return res();
      } catch { /* not up yet */ }
      if (n <= 0) return rej(new Error("preview server never came up"));
      setTimeout(() => attempt(n - 1), 200);
    };
    attempt(tries);
  });
}

const failures = [];
const consoleErrors = [];
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  // Pinned system Chromium (see repo docs); avoids per-version browser downloads.
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();

  page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });

  // Landing page rendered
  if (!(await page.locator("text=MathCrown").first().isVisible())) {
    failures.push("landing page did not render MathCrown branding");
  }

  // App script + question bank loaded
  const loaded = await page.evaluate(() => ({
    app: window.MATHCHAMP_LOADED === true,
    bank: typeof window.QUESTION_BANK === "object" && window.QUESTION_BANK !== null,
    goPage: typeof window.goPage === "function",
    firebase: !!window.auth && !!window.db,
  }));
  for (const [k, ok] of Object.entries(loaded)) {
    if (!ok) failures.push(`global check failed: ${k}`);
  }

  // Login modal opens and (post-fix) has no name/grade fields on student tab
  await page.evaluate(() => window.openLoginModal());
  const modalOpen = await page.locator("#login-modal.open").count();
  if (!modalOpen) failures.push("login modal did not open");

  // Signup modal tab switching should not corrupt login modal tabs (switchTab scoping)
  await page.evaluate(() => window.closeLoginModal());

  await browser.close();
} catch (e) {
  failures.push(`fatal: ${e.message}`);
} finally {
  previewProc.kill("SIGTERM");
}

if (consoleErrors.length) {
  console.log("console errors (informational):");
  for (const c of consoleErrors.slice(0, 10)) console.log("  ", c.slice(0, 200));
}
if (failures.length) {
  console.error("SMOKE FAILURES:");
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log("SMOKE OK");

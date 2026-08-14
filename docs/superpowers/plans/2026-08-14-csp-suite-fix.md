# CSP Report-Only Suite: Fix Flaky Crash — Spec & Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the `csp-report-only` backend test suite pass reliably (it currently crashes with a `SyntaxError` during the violation-report check) so the CI pipeline goes fully green, without touching any production behavior — the app-side CSP code is already correct and verified.

**Root cause (verified):** The suite boots the real server in a child process and captures its stdout by hooking `console.log`. The child emits two lines per CSP violation: a human-readable `[CSP report-only] ...` line and a structured `{"type":"csp-violation",...}` JSON line. Node splits the child's stdout into arbitrary-sized chunks, so the JSON line is sometimes received as two partial captured "lines". The suite's `.find(l => l.includes('"type":"csp-violation"'))` then never matches the (split) JSON line, and instead matches the human-readable line; stripping only the `[server:PORT]` prefix leaves `"[CSP report-only]..."`, and `JSON.parse()` throws `SyntaxError: Unexpected token 'C'` — killing the suite mid-run. This is a timing race, which is why the suite occasionally passes and fails in both CI and local runs.

**Verified app-side evidence:** booting the server in production mode with the mock DB and hitting `/` with `Accept: text/html` returns `200 text/html` with the full report-only CSP header (`strict-dynamic`, `object-src 'none'`, `base-uri 'none'`, `'self'`), and `/health` correctly carries no CSP header. No app change needed.

**Architecture:** Node/Express backend; each test suite is a self-contained script that spawns the server via `tests/helpers/bootServer.js`. The fix lives entirely in the test harness inside `tests/csp-report-only.js` (the console capture + violation parsing).

## Spec (agreed behavior)

1. The suite must pass end-to-end against the production-mode server with the in-memory mock DB: SPA document returns 200 HTML with the report-only CSP header containing `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`, `'self'`; `/health` carries no CSP header; `POST /api/csp-report` returns 204 and the violation is verified as structured JSON (blockedUri, documentUri, timestamp).
2. The violation-JSON detection must survive the JSON line being split across two or more stdout chunks — i.e., the harness must reassemble lines by buffering partial chunks, not by assuming one chunk = one line.
3. If the structured line still cannot be parsed after buffering (defensive), the suite must record the failing check and continue to the summary instead of crashing the whole process — exactly one suite crash must never corrupt other suites in CI's sequential loop.
4. A clear prerequisite error if `frontend/dist/index.html` is missing at suite start, instead of silently failing the header checks.

## File map

| File | Action | Responsibility |
|---|---|---|
| `backend/tests/csp-report-only.js` | Modify | Line-buffer the child stdout capture; harden the violation parse |

## Global constraints (from project instructions)

- No production database writes; this is a test-harness-only change.
- Run the affected suite (and the full `tests/*.js` set) locally before pushing; CI must be green.
- Never commit secrets; keep commit messages in the repo's conventional style.

---

### Task 1: Harden the console capture and violation parsing

**Files:**
- Modify: `backend/tests/csp-report-only.js` (the `console.log` hook + the structured-line section)

- [ ] **Step 1: Replace the naive per-call string join with a chunk-aware line buffer.**

Currently the parent captures with:
```js
console.log = (...args) => {
  const line = args.map(String).join(" ");
  if (line.startsWith(`[server:${PORT}]`)) serverLines.push(line);
  else logs.push(line);
};
```
This fires once per `child.stdout.on("data")` chunk, not per logical line — a chunk can cut a line in half. Change `bootServer`'s child stdout listener is NOT an option (it's shared by all suites); instead, do the buffering INSIDE this suite's hook:

```js
let buffer = "";
console.log = (...args) => {
  const chunk = args.map(String).join(" ");
  buffer += chunk + "\n";
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    if (line.startsWith(`[server:${PORT}]`)) serverLines.push(line);
    else logs.push(line);
  }
};
```
(Keep the `finally { console.log = originalLog }` cleanup untouched.)

- [ ] **Step 2: Harden the violation verification so it never crashes the process.**

Replace the parse block (lines ~113–123) with a try/catch around `JSON.parse`, and if parsing fails, record it as a failing check instead of throwing:

```js
const structured = [...logs, ...serverLines].find((l) => l.includes('"type":"csp-violation"'));
process.stdout.write(`[debug] violation line: ${structured ? structured.slice(0, 300) : null}\n`);
check("the violation is logged as a structured JSON line", Boolean(structured));
let parsed = null;
if (structured) {
  const raw = structured.replace(/^\[server:\d+\]\s*/, "");
  try { parsed = JSON.parse(raw); }
  catch (parseErr) {
    check("the structured line parses as JSON (line-buffered capture)", false, String(parseErr.message).slice(0, 120));
  }
  if (parsed) {
    check("the log carries blockedUri", parsed.blockedUri === "https://evil.example/stealer.js");
    check("the log carries documentUri", parsed.documentUri === "https://example.com/");
    check("the log carries a timestamp", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parsed.timestamp));
  }
}
```

- [ ] **Step 3: Add an explicit dist prerequisite guard at suite start.**

Before `bootServer`, abort with a clear message when the production build is absent:

```js
const fs = require("fs");
const path = require("path");
const distPath = path.resolve(__dirname, "../../frontend/dist/index.html");
if (!fs.existsSync(distPath)) {
  console.error("Prerequisite missing: frontend/dist/index.html — run `cd frontend && npx vite build` first.");
  process.exit(1);
}
```

- [ ] **Step 4: Run the suite repeatedly and confirm GREEN.**

```bash
cd backend && for i in 1 2 3 4 5; do node tests/csp-report-only.js > /tmp/csp_run_$i.log 2>&1 && echo "run $i: PASS" || echo "run $i: FAIL"; done
```

Expected: all five runs exit 0 with "all PASS". Before the fix, runs fail intermittently with the `SyntaxError`; confirm at least two pre-fix runs show the crash for red evidence if needed (already observed earlier today in both local and CI).

### Task 2: Full regression sweep, commit, push, CI

- [ ] **Step 5: Run the full backend suite** (`for f in tests/*.js; do timeout 300 node "$f" ...` as in CI) — all suites green. Note: the `backfill-redeem-values` flake (boot-time ECONNRESET in this sandbox) may still appear; it passes in isolation and is a sandbox quirk, not a code defect — re-run the failing suite alone to confirm.
- [ ] **Step 6: Commit + push to main.**
  ```bash
  git add backend/tests/csp-report-only.js
  git commit -m "fix(tests): make the csp-report-only suite survive chunk-split stdout
  The suite's console-log capture treated each child stdout chunk as a full line, so the
  structured CSP-violation JSON line — sometimes split across chunks — was never matched.
  .find() then landed on the human-readable [CSP report-only] line and JSON.parse crashed
  the whole suite. Buffer partial chunks into logical lines, guard the parse with a check
  instead of a throw, and error clearly when frontend/dist is missing."
  git push
  ```
- [ ] **Step 7: Watch CI to completion.** `gh run list --limit 1` until completed; the job "pnpm lockfile + build + backend suite" must end `success`, followed by the live production smoke test step passing. No deployment actions are triggered by this push beyond Render's automatic auto-deploy on main (backend code unchanged, so no backend restart needed; frontend build assets unchanged).

### Task 3: Report to user
- State what was wrong (test harness race, app code untouched), what changed, and that CI is green.
- Invite the user to spot-check the admin Redeem report page in their browser to confirm the clickable customer names landed in production (the earlier fix's deploy).

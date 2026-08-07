# Render Health Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight, unauthenticated `GET /health` endpoint so an external cron (cron-job.org, set up manually post-deploy) can ping it every ~10 minutes to keep the Render free-tier instance from sleeping.

**Architecture:** One route handler added directly in `backend/server.js`, mounted before all tenant/auth middleware. Returns `200 {status: "ok"}` synchronously — no DB call, no dependency on the mock/real Mongoose split.

**Tech Stack:** Express (existing `backend/server.js`), plain Node `http` for the test.

## Global Constraints
- No new npm dependencies.
- Route must not require `resolveTenant`, `verifyToken`, or any other middleware — it must respond even if the DB layer is unhealthy, since its only job is proving the process is alive.
- Follow existing code style in `server.js` (the `GET /` handler right above it is the closest precedent).

---

### Task 1: Add `/health` route and test

**Files:**
- Modify: `backend/server.js:96-103` (insert new route directly after the existing `express.json()` call and before the `GET /` handler, or immediately after it — either position is fine since both are pre-middleware)
- Test: `backend/tests/health-endpoint.js` (new file)
- Modify: `backend/package.json` (add the new test file to the `test` script chain)

**Interfaces:**
- Consumes: `backend/tests/helpers/bootServer.js`'s existing `bootServer({port, timeoutMs})` → `{baseUrl, stop}` helper (already used by every other test file in `backend/tests/`).
- Produces: nothing consumed by later tasks — this is a standalone group.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/health-endpoint.js`:

```javascript
const http = require("http");
const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5030 });
  try {
    const body = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/health`, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Expected 200, got ${res.statusCode}`));
            return;
          }
          resolve(JSON.parse(data));
        });
      }).on("error", reject);
    });

    if (body.status !== "ok") {
      throw new Error(`Expected {status: "ok"}, got ${JSON.stringify(body)}`);
    }

    console.log("✓ GET /health returns 200 {status: \"ok\"}");
  } finally {
    await stop();
  }
}

main().catch((err) => {
  console.error("✗ health-endpoint test failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node tests/health-endpoint.js`
Expected: FAIL — connection refused or 404, since `/health` doesn't exist yet.

- [ ] **Step 3: Add the route in `server.js`**

Open `backend/server.js` and find the existing block:

```javascript
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: `${PLATFORM_NAME} loyalty platform API is running.`
  });
});
```

Insert a new route immediately after the `GET "/"` handler:

```javascript
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node tests/health-endpoint.js`
Expected: `✓ GET /health returns 200 {status: "ok"}`, exit code 0.

- [ ] **Step 5: Add to the test chain**

Open `backend/package.json`, find the `"test"` script (a chained sequence of `node tests/*.js` runs), and add `&& node tests/health-endpoint.js` to the chain, following the exact same pattern as the neighboring entries.

Run: `cd backend && npm test 2>&1 | tail -20`
Expected: full suite still passes, including the new health-endpoint line.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/tests/health-endpoint.js backend/package.json
git commit -m "$(cat <<'EOF'
feat: add GET /health endpoint for Render keep-alive pings

Render's free tier sleeps after 15min of inactivity. An external cron
(cron-job.org, configured post-deploy) will ping this every ~10 minutes
to keep the instance warm.
EOF
)"
```

---

## Post-implementation note (not a task — manual, outside this repo)

After this deploys to Render, set up a free cron-job.org job hitting `https://<render-url>/health` every 10 minutes. This is a dashboard step on cron-job.org's site, not something committed to the codebase.

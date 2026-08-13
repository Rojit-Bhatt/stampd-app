const http = require("http");

const { bootServer } = require("./helpers/bootServer");

let BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5001";
const COMPANY = "coffesarowar";
const TENANT_SLUG = "durbarmarg";

async function jsonFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const config = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: config.method,
      headers: config.headers,
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve(parsed),
          });
        } catch (_) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve({ success: false, message: data }),
          });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (config.body) {
      req.write(config.body);
    }
    req.end();
  });
}

async function runQa() {
  console.log("=== STARTING CAFÉ LOYALTY E2E INTEGRATION QA ===");

  const results = {};

  // 1. Customer Registration
  try {
    const registerEmail = `qa-${Date.now()}@coffesarowar.cafe`;
    console.log(`1. Testing registration with email: ${registerEmail}...`);
    const regRes = await jsonFetch("/api/auth/register", {
      method: "POST",
      headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": TENANT_SLUG },
      body: {
        name: "QA Test User",
        email: registerEmail,
        phone: "+9779812345678",
        password: "password123",
      },
    });

    const regData = await regRes.json();
    if (regRes.ok && regData.success) {
      console.log("✅ Registration Succeeded:", regData);
      results["FLOW-1-REGISTER"] = "PASS";
    } else {
      console.error("❌ Registration Failed:", regData);
      results["FLOW-1-REGISTER"] = "FAIL";
    }

    // 2. Customer Login
    console.log("2. Testing login...");
    const loginRes = await jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": TENANT_SLUG },
      body: {
        email: registerEmail,
        password: "password123",
      },
    });

    const loginData = await loginRes.json();
    let customerToken = null;
    if (loginRes.ok && loginData.success && loginData.token) {
      customerToken = loginData.token;
      console.log("✅ Customer Login Succeeded. Token retrieved.");
      results["FLOW-2-LOGIN"] = "PASS";
    } else {
      console.error("❌ Customer Login Failed:", loginData);
      results["FLOW-2-LOGIN"] = "FAIL";
    }

    // 3. Visit Dashboard / points balance with token
    if (customerToken) {
      console.log("3. Testing points balance fetching with valid token...");
      const cardRes = await jsonFetch("/api/points/balance", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const cardData = await cardRes.json();
      if (cardRes.ok && cardData.success && typeof cardData.data.balance === "number") {
        console.log("✅ Fetch points balance Succeeded:", cardData);
        results["FLOW-3-DASHBOARD-DATA"] = "PASS";
      } else {
        console.error("❌ Fetch points balance Failed:", cardData);
        results["FLOW-3-DASHBOARD-DATA"] = "FAIL";
      }
    } else {
      results["FLOW-3-DASHBOARD-DATA"] = "SKIP";
    }

    // 4. Visit without logged in (Auth Guard check simulation)
    console.log("4. Testing points balance fetching WITHOUT token...");
    const cardNoAuthRes = await jsonFetch("/api/points/balance");
    const cardNoAuthData = await cardNoAuthRes.json();
    if (cardNoAuthRes.status === 401 || !cardNoAuthData.success) {
      console.log("✅ Correctly rejected unauthenticated request:", cardNoAuthData);
      results["FLOW-4-AUTH-GUARD"] = "PASS";
    } else {
      console.error("❌ Failed to block unauthenticated request:", cardNoAuthData);
      results["FLOW-4-AUTH-GUARD"] = "FAIL";
    }

    // 6. Points history fetching
    if (customerToken) {
      console.log("6. Testing points history fetch with valid token...");
      const histRes = await jsonFetch("/api/points/history", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const histData = await histRes.json();
      if (histRes.ok && Array.isArray(histData.data)) {
        console.log(`✅ Fetch points history Succeeded (${histData.data.length} rows)`);
        results["FLOW-6-HISTORY-DATA"] = "PASS";
      } else {
        console.error("❌ Fetch points history Failed:", histData);
        results["FLOW-6-HISTORY-DATA"] = "FAIL";
      }
    } else {
      results["FLOW-6-HISTORY-DATA"] = "SKIP";
    }

  } catch (err) {
    console.error("Customer Flows Error:", err);
    results["CUSTOMER-FLOWS"] = "FAIL";
  }

  // Admin Flows
  try {
    // 9. Admin Login — via the unified slug-less endpoint. An outlet admin's
    // credential lives on its AdminAccount, not on the tenant User row, so
    // the tenant-scoped /api/auth/login no longer serves admins at all.
    console.log("9. Testing Admin login with seeded credentials...");
    const adminEmail = "durbarmarg@coffesarowar.com";
    const adminLoginRes = await jsonFetch("/api/admin-auth/login", {
      method: "POST",
      body: {
        email: adminEmail,
        password: "password",
      },
    });

    const adminLoginData = await adminLoginRes.json();
    let adminToken = null;
    if (adminLoginRes.ok && adminLoginData.success && adminLoginData.token) {
      adminToken = adminLoginData.token;
      if (adminLoginData.user && adminLoginData.user.role === "business_admin") {
        console.log("✅ Admin Login Succeeded. Token and role are correct.");
        results["FLOW-9-ADMIN-LOGIN"] = "PASS";
      } else {
        console.error("❌ Admin Login returned wrong role or user:", adminLoginData.user);
        results["FLOW-9-ADMIN-LOGIN"] = "FAIL";
      }
    } else {
      console.error("❌ Admin Login Failed:", adminLoginData);
      results["FLOW-9-ADMIN-LOGIN"] = "FAIL";
    }

    // 8. Admin Guard Check
    console.log("8. Testing Admin Console path protection...");
    const adminConsoleNoAuthRes = await jsonFetch("/api/admin/transactions");
    const adminConsoleNoAuthData = await adminConsoleNoAuthRes.json();
    if (adminConsoleNoAuthRes.status === 401 || !adminConsoleNoAuthData.success) {
      console.log("✅ Correctly rejected unauthenticated admin request:", adminConsoleNoAuthData);
      results["FLOW-8-ADMIN-GUARD"] = "PASS";
    } else {
      console.error("❌ Failed to block unauthenticated admin request:", adminConsoleNoAuthData);
      results["FLOW-8-ADMIN-GUARD"] = "FAIL";
    }

    // 10. Generate an earn QR. A bill amount is mandatory now — the award is
    // a function of it, so a bill-less token could only ever award zero.
    let qrToken = null;
    if (adminToken) {
      console.log("10. Testing QR earn Token Generation...");
      const qrRes = await jsonFetch("/api/admin/generate-qr", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { billAmount: 450 },
      });
      const qrData = await qrRes.json();
      if (qrRes.ok && qrData.success && qrData.data && qrData.data.token) {
        qrToken = qrData.data.token;
        console.log("✅ QR Generation Succeeded:", qrData);
        results["FLOW-10-QR-GENERATION"] = "PASS";
      } else {
        console.error("❌ QR Generation Failed:", qrData);
        results["FLOW-10-QR-GENERATION"] = "FAIL";
      }
    } else {
      results["FLOW-10-QR-GENERATION"] = "SKIP";
    }

    // 11. Outlet transaction ledger
    if (adminToken) {
      console.log("11. Testing outlet transaction ledger...");
      const scansRes = await jsonFetch("/api/admin/transactions", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const scansData = await scansRes.json();
      if (scansRes.ok && scansData.success && Array.isArray(scansData.data)) {
        console.log(`✅ Transaction ledger fetch Succeeded (${scansData.data.length} rows)`);
        results["FLOW-11-LEDGER-POLL"] = "PASS";
      } else {
        console.error("❌ Transaction ledger fetch Failed:", scansData);
        results["FLOW-11-LEDGER-POLL"] = "FAIL";
      }
    } else {
      results["FLOW-11-LEDGER-POLL"] = "SKIP";
    }

    // 12. A bill-less earn QR must be refused.
    if (adminToken) {
      console.log("12. Testing that an earn QR without a bill is refused...");
      const noBillRes = await jsonFetch("/api/admin/generate-qr", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {},
      });
      const noBillData = await noBillRes.json();
      if (noBillRes.status === 400 && !noBillData.success) {
        console.log("✅ Correctly refused a bill-less earn QR:", noBillData.message);
        results["FLOW-12-BILL-REQUIRED"] = "PASS";
      } else {
        console.error("❌ False positive: issued an earn QR with no bill:", noBillData);
        results["FLOW-12-BILL-REQUIRED"] = "FAIL";
      }
    } else {
      results["FLOW-12-BILL-REQUIRED"] = "SKIP";
    }

  } catch (err) {
    console.error("Admin Flows Error:", err);
    results["ADMIN-FLOWS"] = "FAIL";
  }

  console.log("\n=== E2E INTEGRATION QA SUMMARY ===");
  let failed = 0;
  for (const [flow, result] of Object.entries(results)) {
    const symbol = result === "PASS" ? "✅" : result === "SKIP" ? "🟡" : "❌";
    if (result === "FAIL") failed++;
    console.log(`${symbol} ${flow}: ${result}`);
  }
  return failed;
}

(async () => {
  // Self-contained unless TEST_BASE_URL is supplied — boot our own server on a
  // dedicated port so `npm test` needs no manually-started server.
  let server = null;
  if (!process.env.TEST_BASE_URL) {
    server = await bootServer({ port: 0 });
    BASE_URL = server.baseUrl;
  }
  let code = 1;
  try {
    code = (await runQa()) ? 1 : 0;
  } catch (err) {
    console.error("QA run crashed:", err);
    code = 1;
  }
  if (server) server.stop();
  process.exit(code);
})();

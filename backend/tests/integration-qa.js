const http = require("http");

const { bootServer } = require("./helpers/bootServer");

let BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5001";
const TENANT_SLUG = "coffesarowar";

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
      headers: { "X-Tenant-Slug": TENANT_SLUG },
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
      headers: { "X-Tenant-Slug": TENANT_SLUG },
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

    // 3. Visit Dashboard / Stamp Card with token
    if (customerToken) {
      console.log("3. Testing Stamp Card fetching with valid token...");
      const cardRes = await jsonFetch("/api/stamps/balance", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const cardData = await cardRes.json();
      if (cardRes.ok && cardData.success) {
        console.log("✅ Fetch Stamp Card Succeeded:", cardData);
        results["FLOW-3-DASHBOARD-DATA"] = "PASS";
      } else {
        console.error("❌ Fetch Stamp Card Failed:", cardData);
        results["FLOW-3-DASHBOARD-DATA"] = "FAIL";
      }
    } else {
      results["FLOW-3-DASHBOARD-DATA"] = "SKIP";
    }

    // 4. Visit without logged in (Auth Guard check simulation)
    console.log("4. Testing Stamp Card fetching WITHOUT token...");
    const cardNoAuthRes = await jsonFetch("/api/stamps/balance");
    const cardNoAuthData = await cardNoAuthRes.json();
    if (cardNoAuthRes.status === 401 || !cardNoAuthData.success) {
      console.log("✅ Correctly rejected unauthenticated request:", cardNoAuthData);
      results["FLOW-4-AUTH-GUARD"] = "PASS";
    } else {
      console.error("❌ Failed to block unauthenticated request:", cardNoAuthData);
      results["FLOW-4-AUTH-GUARD"] = "FAIL";
    }

    // 6. Wallet Vouchers Fetching
    if (customerToken) {
      console.log("6. Testing Vouchers fetch with valid token...");
      const vouchersRes = await jsonFetch("/api/vouchers/my-wallet", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const vouchersData = await vouchersRes.json();
      if (vouchersRes.ok && Array.isArray(vouchersData.vouchers)) {
        console.log(`✅ Fetch Vouchers Succeeded (found ${vouchersData.vouchers.length} vouchers):`, vouchersData);
        results["FLOW-6-WALLET-DATA"] = "PASS";
      } else {
        console.error("❌ Fetch Vouchers Failed:", vouchersData);
        results["FLOW-6-WALLET-DATA"] = "FAIL";
      }
    } else {
      results["FLOW-6-WALLET-DATA"] = "SKIP";
    }

  } catch (err) {
    console.error("Customer Flows Error:", err);
    results["CUSTOMER-FLOWS"] = "FAIL";
  }

  // Admin Flows
  try {
    // 9. Admin Login
    console.log("9. Testing Admin login with seeded credentials...");
    const adminEmail = "barista@mansarowar.cafe";
    const adminLoginRes = await jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "X-Tenant-Slug": TENANT_SLUG },
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
    const adminConsoleNoAuthRes = await jsonFetch("/api/admin/recent-scans");
    const adminConsoleNoAuthData = await adminConsoleNoAuthRes.json();
    if (adminConsoleNoAuthRes.status === 401 || !adminConsoleNoAuthData.success) {
      console.log("✅ Correctly rejected unauthenticated admin request:", adminConsoleNoAuthData);
      results["FLOW-8-ADMIN-GUARD"] = "PASS";
    } else {
      console.error("❌ Failed to block unauthenticated admin request:", adminConsoleNoAuthData);
      results["FLOW-8-ADMIN-GUARD"] = "FAIL";
    }

    // 10. Generate New Stamp Token (QR code data)
    let qrToken = null;
    if (adminToken) {
      console.log("10. Testing QR Stamp Token Generation...");
      const qrRes = await jsonFetch("/api/admin/generate-qr", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
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

    // 11. Live Scans Poll
    if (adminToken) {
      console.log("11. Testing Live Scans listing (poll endpoint)...");
      const scansRes = await jsonFetch("/api/admin/recent-scans", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const scansData = await scansRes.json();
      if (scansRes.ok && scansData.success) {
        console.log("✅ Live Scans fetch Succeeded:", scansData);
        results["FLOW-11-LIVE-SCANS-POLL"] = "PASS";
      } else {
        console.error("❌ Live Scans fetch Failed:", scansData);
        results["FLOW-11-LIVE-SCANS-POLL"] = "FAIL";
      }
    } else {
      results["FLOW-11-LIVE-SCANS-POLL"] = "SKIP";
    }

    // 12. Test voucher verification with known invalid code
    if (adminToken) {
      console.log("12. Testing voucher redemption with invalid code 'COFF-INVALID1'...");
      const redeemRes = await jsonFetch("/api/admin/redeem-voucher", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { voucherCode: "COFF-INVALID1" },
      });
      const redeemData = await redeemRes.json();
      if (redeemRes.status === 404 || redeemRes.status === 400 || !redeemData.success) {
        console.log("✅ Correctly rejected invalid voucher:", redeemData);
        results["FLOW-12-VOUCHER-INVALID"] = "PASS";
      } else {
        console.error("❌ False positive: allowed invalid voucher redemption:", redeemData);
        results["FLOW-12-VOUCHER-INVALID"] = "FAIL";
      }
    } else {
      results["FLOW-12-VOUCHER-INVALID"] = "SKIP";
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
    server = await bootServer({ port: 5011 });
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

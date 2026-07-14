const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const PORT = 5003;
const BASE_URL = `http://localhost:${PORT}`;
const TENANT_SLUG = "coffesarowar";

// Helper for making JSON requests and capturing raw HTTP interactions
function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(`${BASE_URL}${urlPath}`);
    const reqHeaders = {
      "Content-Type": "application/json",
      ...headers,
    };

    let requestBodyString = "";
    if (body) {
      requestBodyString = JSON.stringify(body);
      reqHeaders["Content-Length"] = Buffer.byteLength(requestBodyString);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: reqHeaders,
    };

    // Log the RAW request
    let rawRequestLog = `>>> ${method} ${urlPath} HTTP/1.1\n`;
    for (const [key, val] of Object.entries(reqHeaders)) {
      rawRequestLog += `${key}: ${val}\n`;
    }
    if (requestBodyString) {
      rawRequestLog += `\n${requestBodyString}`;
    }

    const req = http.request(options, (res) => {
      let rawResponseLog = `<<< HTTP/1.1 ${res.statusCode} ${res.statusMessage}\n`;
      for (const [key, val] of Object.entries(res.headers)) {
        rawResponseLog += `${key}: ${val}\n`;
      }

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (data) {
          rawResponseLog += `\n${data}`;
        }
        
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawRequestLog,
            rawResponseLog
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: { rawText: data },
            rawRequestLog,
            rawResponseLog
          });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(requestBodyString);
    }
    req.end();
  });
}

async function run() {
  console.log(`Preparing E2E test server on port ${PORT}...`);

  // 1. Read existing server.js
  const serverJsPath = path.resolve(__dirname, "../server.js");
  let serverCode = fs.readFileSync(serverJsPath, "utf8");

  // 2. Modify port and add test cooldown reset route
  serverCode = serverCode.replace("const PORT = 5001;", `const PORT = ${PORT};`);
  
  const testRouteCode = `
app.use("/api/reviews", reviewsRoutes);
app.post("/api/test/reset-cooldown", async (req, res) => {
  try {
    const StampCard = require("./models/StampCard");
    const card = await StampCard.findOne({ userId: req.body.userId });
    if (card) {
      card.lastStampedAt = null;
      await card.save();
      res.json({ success: true, message: "Cooldown reset successful.", found: true });
    } else {
      res.json({ success: true, message: "Stamp card not found.", found: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
`;

  serverCode = serverCode.replace('app.use("/api/reviews", reviewsRoutes);', testRouteCode);

  const testServerPath = path.resolve(__dirname, "../server-test.js");
  fs.writeFileSync(testServerPath, serverCode, "utf8");
  console.log("Temporary test server code written to server-test.js");

  // 3. Start the test server
  const testEnv = { ...process.env };
  delete testEnv.MONGODB_URI;
  // server.js reads `process.env.PORT || 5001`, so drive the port via env.
  // (The old code tried to string-replace `const PORT = 5001;`, which no
  // longer matches `const PORT = process.env.PORT || 5001;` — leaving the
  // test server on 5001 while requests hit 5003 → ECONNREFUSED.)
  testEnv.PORT = String(PORT);
  const serverProcess = spawn("node", [testServerPath], {
    env: testEnv,
    cwd: path.resolve(__dirname, "..")
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server Stdout] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Stderr] ${data.toString().trim()}`);
  });

  // Wait 2 seconds for server to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\nServer started. Commencing HTTP sequences...\n");

  try {
    // A. LOGIN ADMIN
    console.log("--- TEST A: LOGIN ADMIN ---");
    const adminLoginRes = await makeRequest("POST", "/api/auth/login", { "X-Tenant-Slug": TENANT_SLUG }, {
      email: "barista@mansarowar.cafe",
      password: "password"
    });
    console.log(adminLoginRes.rawRequestLog);
    console.log("\n" + adminLoginRes.rawResponseLog + "\n");

    const adminToken = adminLoginRes.body.token;

    // B. LOGIN CUSTOMER
    console.log("--- TEST B: LOGIN CUSTOMER ---");
    const customerLoginRes = await makeRequest("POST", "/api/auth/login", { "X-Tenant-Slug": TENANT_SLUG }, {
      email: "customer@mansarowar.cafe",
      password: "password"
    });
    console.log(customerLoginRes.rawRequestLog);
    console.log("\n" + customerLoginRes.rawResponseLog + "\n");

    const customerToken = customerLoginRes.body.token;
    const customerUserId = customerLoginRes.body.user.id;

    // C. GET CURRENT WALLET & STAMPS
    console.log("--- TEST C: GET CURRENT STAMP BALANCE ---");
    const balanceRes = await makeRequest("GET", "/api/stamps/balance", {
      Authorization: `Bearer ${customerToken}`
    });
    console.log(balanceRes.rawRequestLog);
    console.log("\n" + balanceRes.rawResponseLog + "\n");

    let currentStamps = balanceRes.body.data.stampsEarned;
    console.log(`Current stamps count: ${currentStamps}`);

    // D. EARN STAMPS UNTIL MILESTONE (5 stamps) TO GENERATE VOUCHER
    console.log("--- TEST D: CLAIMING STAMPS TO REACH 5 MILESTONE ---");
    let earnedVoucherCode = null;

    while (currentStamps < 5) {
      console.log(`\n--- Stamp cycle: claiming stamp #${currentStamps + 1} ---`);
      
      // 1. Reset cooldown first
      const resetRes = await makeRequest("POST", "/api/test/reset-cooldown", {}, {
        userId: customerUserId
      });
      
      // 2. Admin generates QR Token
      const qrRes = await makeRequest("POST", "/api/admin/generate-qr", {
        Authorization: `Bearer ${adminToken}`
      });
      const qrToken = qrRes.body.data.token;
      
      // 3. Customer claims stamp
      const claimRes = await makeRequest("POST", "/api/stamps/claim", {
        Authorization: `Bearer ${customerToken}`
      }, {
        token: qrToken
      });
      console.log(claimRes.rawRequestLog);
      console.log("\n" + claimRes.rawResponseLog + "\n");

      if (claimRes.body.data && claimRes.body.data.voucherCode) {
        earnedVoucherCode = claimRes.body.data.voucherCode;
        break;
      }
      currentStamps = claimRes.body.data.stampsEarned;
    }

    if (!earnedVoucherCode) {
      throw new Error("No voucher generated after reaching the 5-stamp milestone.");
    }
    if (!earnedVoucherCode.startsWith("COFF-")) {
      throw new Error(`Voucher ${earnedVoucherCode} does not use coffesarowar's COFF- prefix.`);
    }
    console.log(`Successfully reached milestone! Generated Voucher Code: ${earnedVoucherCode}`);

    // E. FETCH CUSTOMER WALLET
    console.log("--- TEST E: FETCH CUSTOMER WALLET ---");
    const walletRes = await makeRequest("GET", "/api/vouchers/my-wallet", {
      Authorization: `Bearer ${customerToken}`
    });
    console.log(walletRes.rawRequestLog);
    console.log("\n" + walletRes.rawResponseLog + "\n");

    // F. REDEEM THE VOUCHER AS ADMIN
    console.log("--- TEST F: REDEEM VOUCHER AS ADMIN ---");
    const redeemRes = await makeRequest("POST", "/api/admin/redeem-voucher", {
      Authorization: `Bearer ${adminToken}`
    }, {
      voucherCode: earnedVoucherCode
    });
    console.log(redeemRes.rawRequestLog);
    console.log("\n" + redeemRes.rawResponseLog + "\n");

    // G. VERIFY REDEEMED VOUCHER IS GONE FROM WALLET
    console.log("--- TEST G: VERIFY WALLET AFTER REDEMPTION ---");
    const finalWalletRes = await makeRequest("GET", "/api/vouchers/my-wallet", {
      Authorization: `Bearer ${customerToken}`
    });
    console.log(finalWalletRes.rawRequestLog);
    console.log("\n" + finalWalletRes.rawResponseLog + "\n");

    if (redeemRes.statusCode !== 200) {
      throw new Error(`Voucher redemption failed with status ${redeemRes.statusCode}.`);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exitCode = 1;
  } finally {
    console.log("Cleaning up test server process...");
    serverProcess.kill();
    try {
      fs.unlinkSync(testServerPath);
    } catch (e) {}
    console.log("E2E test run finished.");
  }
}

run();

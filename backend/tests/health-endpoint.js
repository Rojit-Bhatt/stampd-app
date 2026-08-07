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

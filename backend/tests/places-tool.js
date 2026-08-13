/**
 * Google Places autocomplete proxy (/api/tools/places/autocomplete).
 *
 * This endpoint is unauthenticated, sits on a public marketing page, and every
 * call it forwards is billed by Google. So the things worth testing are not
 * "does it return results" but the three guards that stand between it and an
 * unbounded bill: input-length validation before any outbound call, the
 * per-IP limiter, and a clean 503 when no key is configured.
 *
 * bootServer spawns the server as a child process, so `fetch` cannot be
 * stubbed in-process. A local HTTP server impersonates Google instead, and
 * PLACES_API_BASE_URL points the child at it. That server also counts hits,
 * which is how "rejected before any outbound call" is actually asserted
 * rather than assumed.
 *
 * Run directly: `node tests/places-tool.js`
 */

const http = require("http");
const { bootServer } = require("./helpers/bootServer");

const STUB_PORT = 5111;

// A realistic Places API (New) autocomplete payload. It deliberately carries
// fields the product has no use for (`types`, `place`, `text`) so the test can
// assert they do not leak through the reshape.
const GOOGLE_FIXTURE = {
  suggestions: [
    {
      placePrediction: {
        place: "places/ChIJAAAAAAAAAAAAAAAAAAAAAA",
        placeId: "ChIJAAAAAAAAAAAAAAAAAAAAAA",
        text: { text: "Himalayan Brew, Thamel, Kathmandu" },
        structuredFormat: {
          mainText: { text: "Himalayan Brew" },
          secondaryText: { text: "Thamel, Kathmandu, Nepal" }
        },
        types: ["cafe", "food"]
      }
    },
    {
      placePrediction: {
        place: "places/ChIJBBBBBBBBBBBBBBBBBBBBBB",
        placeId: "ChIJBBBBBBBBBBBBBBBBBBBBBB",
        text: { text: "Himalayan Java, Durbar Marg" },
        structuredFormat: {
          mainText: { text: "Himalayan Java" },
          secondaryText: { text: "Durbar Marg, Kathmandu, Nepal" }
        },
        types: ["cafe"]
      }
    },
    // A query prediction, which carries no placePrediction at all. The reshape
    // must drop it rather than emitting an entry with an empty placeId.
    { queryPrediction: { text: { text: "himalayan coffee" } } }
  ]
};

function startGoogleStub() {
  const state = { hits: 0, lastBody: null, lastApiKey: null };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      state.hits++;
      state.lastApiKey = req.headers["x-goog-api-key"] || null;
      try { state.lastBody = JSON.parse(raw); } catch (_) { state.lastBody = null; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(GOOGLE_FIXTURE));
    });
  });
  return new Promise((resolve) => {
    server.listen(STUB_PORT, () => resolve({ state, stop: () => server.close() }));
  });
}

async function main() {
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };

  const stub = await startGoogleStub();

  // One server with no key configured, one with a key pointed at the stub.
  const unconfigured = await bootServer({
    port: 0,
    env: { GOOGLE_PLACES_API_KEY: "" }
  });
  const configured = await bootServer({
    port: 0,
    env: {
      GOOGLE_PLACES_API_KEY: "test-key",
      PLACES_API_BASE_URL: `http://localhost:${STUB_PORT}`
    }
  });

  const post = (baseUrl, input) =>
    fetch(`${baseUrl}/api/tools/places/autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  try {
    // --- No key configured -------------------------------------------------
    const noKey = await post(unconfigured.baseUrl, "himalayan brew");
    check("no key -> 503", noKey.status === 503);
    check("no key -> code PLACES_UNCONFIGURED", noKey.body?.code === "PLACES_UNCONFIGURED");

    // --- Input validation, before any outbound call ------------------------
    const hitsBeforeValidation = stub.state.hits;

    const tooShort = await post(configured.baseUrl, "hi");
    check("2-character input -> 400", tooShort.status === 400);
    check("2-character input -> code INVALID_INPUT", tooShort.body?.code === "INVALID_INPUT");

    const tooLong = await post(configured.baseUrl, "a".repeat(121));
    check("121-character input -> 400", tooLong.status === 400);

    const blank = await post(configured.baseUrl, "   ");
    check("whitespace-only input -> 400", blank.status === 400);

    check(
      "rejected input makes ZERO outbound calls",
      stub.state.hits === hitsBeforeValidation
    );

    // --- Happy path --------------------------------------------------------
    const ok = await post(configured.baseUrl, "himalayan brew");
    check("valid input -> 200", ok.status === 200);
    check("valid input forwards to Google", stub.state.hits === hitsBeforeValidation + 1);
    check("forwards the API key as a header", stub.state.lastApiKey === "test-key");
    check("biases results to Nepal", JSON.stringify(stub.state.lastBody?.includedRegionCodes) === JSON.stringify(["np"]));
    check("trims the input before forwarding", stub.state.lastBody?.input === "himalayan brew");

    const results = ok.body?.results;
    check("returns an array", Array.isArray(results));
    check("drops the query prediction", results?.length === 2);
    check("maps placeId", results?.[0]?.placeId === "ChIJAAAAAAAAAAAAAAAAAAAAAA");
    check("maps mainText to name", results?.[0]?.name === "Himalayan Brew");
    check("maps secondaryText to address", results?.[0]?.address === "Thamel, Kathmandu, Nepal");
    check("entry has exactly three fields", Object.keys(results?.[0] || {}).length === 3);

    // Google's own field names must not survive the reshape — forwarding the
    // raw payload would pin this response to a third party's schema.
    const blob = JSON.stringify(ok.body);
    for (const leaked of ["structuredFormat", "placePrediction", "queryPrediction", "types", "mainText"]) {
      check(`response does not leak ${leaked}`, !blob.includes(leaked));
    }

    // --- Rate limiter ------------------------------------------------------
    // The limiter is 30 per 5 minutes per IP and counts every request that
    // reaches it, including the ones above. Firing well past the threshold
    // makes the assertion independent of how many were already spent.
    let sawTooMany = false;
    for (let i = 0; i < 40; i++) {
      const res = await post(configured.baseUrl, "himalayan brew");
      if (res.status === 429) { sawTooMany = true; break; }
    }
    check("limiter trips past its threshold", sawTooMany);

    if (failures === 0) console.log("\nAll places tool checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    unconfigured.stop();
    configured.stop();
    stub.stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Rate-limit client-key suite.
 *
 * Production traffic reaches the app as browser -> Cloudflare -> Render's
 * proxy -> Express. With `trust proxy` set to one hop, req.ip is the address
 * that connected to Render — a Cloudflare EDGE IP, shared by every customer
 * routed through the same POP. Keying the limiters on it meant one busy cafe
 * could exhaust registrationLimiter (10/hour) for everyone behind that edge,
 * so new customers couldn't sign up at the counter.
 *
 * clientKey must:
 *   - use CF-Connecting-IP when (and only when) the connecting address is a
 *     Cloudflare range — the origin is also reachable directly on
 *     onrender.com, where that header is attacker-controlled;
 *   - otherwise fall back to req.ip.
 *
 * Run directly: `node tests/rate-limit-client-key.js`
 */

const { clientKey } = require("../middleware/rateLimitMiddleware");

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
};

const req = (ip, headers = {}) => ({ ip, headers });

// Cloudflare edge (162.158.0.0/15) forwarding a real client.
check(
  "Cloudflare IPv4 edge -> keyed on CF-Connecting-IP",
  clientKey(req("162.158.10.20", { "cf-connecting-ip": "27.34.1.2" })) === clientKey(req("27.34.1.2"))
);
check(
  "two customers behind the same edge get different keys",
  clientKey(req("162.158.10.20", { "cf-connecting-ip": "27.34.1.2" })) !==
    clientKey(req("162.158.10.20", { "cf-connecting-ip": "27.34.9.9" }))
);
check(
  "IPv4-mapped IPv6 edge address is recognised",
  clientKey(req("::ffff:104.16.5.5", { "cf-connecting-ip": "27.34.1.2" })) === clientKey(req("27.34.1.2"))
);
check(
  "Cloudflare IPv6 edge -> keyed on CF-Connecting-IP",
  clientKey(req("2606:4700:10::1", { "cf-connecting-ip": "27.34.1.2" })) === clientKey(req("27.34.1.2"))
);

// Direct hit on the onrender.com origin with a forged header: ignored.
check(
  "non-Cloudflare caller cannot choose its key via CF-Connecting-IP",
  clientKey(req("203.0.113.7", { "cf-connecting-ip": "1.1.1.1" })) === clientKey(req("203.0.113.7"))
);
check(
  "forged header from a non-Cloudflare caller doesn't split its bucket",
  clientKey(req("203.0.113.7", { "cf-connecting-ip": "1.1.1.1" })) ===
    clientKey(req("203.0.113.7", { "cf-connecting-ip": "8.8.8.8" }))
);

// No header / garbage header from a Cloudflare edge: fall back to req.ip.
check("Cloudflare edge without the header -> req.ip", clientKey(req("162.158.10.20")) === clientKey(req("162.158.10.20", {})));
check(
  "garbage CF-Connecting-IP -> req.ip",
  clientKey(req("162.158.10.20", { "cf-connecting-ip": "not-an-ip" })) === clientKey(req("162.158.10.20"))
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll rate-limit client-key checks passed.");

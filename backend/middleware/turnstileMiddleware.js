// Cloudflare Turnstile verification for unauthenticated, abuse-prone
// endpoints (login, register, forgot-password) — a human check the IP-based
// rate limiters can't provide, since those are trivially bypassed by
// rotating IPs. Fatal-in-production, same pattern as JWT_SECRET in
// server.js: a prod deploy with no secret key must refuse to boot, not
// silently skip the check.
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

if (!SECRET_KEY) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: TURNSTILE_SECRET_KEY must be set in production.");
    process.exit(1);
  }
  console.warn("[dev] TURNSTILE_SECRET_KEY not set — Turnstile checks are skipped in dev.");
}

const verifyTurnstile = async (req, res, next) => {
  if (!SECRET_KEY) {
    return next();
  }

  const token = req.body?.turnstileToken;
  if (!token) {
    return res.status(400).json({ success: false, message: "Verification challenge is required." });
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: SECRET_KEY, response: token, remoteip: req.ip })
    });
    const result = await response.json();
    if (!result.success) {
      return res.status(400).json({ success: false, message: "Verification challenge failed. Please try again." });
    }
    return next();
  } catch (_err) {
    return res.status(503).json({ success: false, message: "Verification service unavailable. Please try again." });
  }
};

module.exports = { verifyTurnstile };

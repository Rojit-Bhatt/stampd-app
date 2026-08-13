// Zod request-body validation layer. Each mutating controller imports the
// exact schema it needs and mounts `validateBody(schema)` as route middleware
// — by the time the handler runs, req.body is already the SANITIZED,
// type-coerced output (zod strips unknown keys), so handler code can read
// fields directly without re-checking types or shapes.
//
// Why middleware and not inline: every controller was previously doing its
// own ad-hoc field checks ("if (!token) throw 400") scattered at the top of
// the handler. Coercing to a schema here means the handler either receives
// a clean, typed body or the route never reaches it — and the error shape
// matches the rest of the API so the frontend's error path handles it.
//
// Error shape: { success: false, message } — same as jsonHandler in
// rateLimitMiddleware, so apiRequest parses it cleanly.
const validateBody = (schema) => async (req, res, next) => {
  try {
    const result = await schema.parseAsync(req.body);
    req.body = result;
    next();
  } catch (error) {
    // Zod folds every violated path into one human-readable message — good
    // enough for a 400 without leaking the raw issue tree to the client.
    const message = error.issues?.map((i) => i.message).join("; ") || "Invalid request body.";
    res.status(400).json({ success: false, message });
  }
};
module.exports = { validateBody };

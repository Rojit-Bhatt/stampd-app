# TODO

01. Compress API responses in transit
Check whether API responses are compressed in transit. Enable gzip or brotli compression on the server or edge for JSON and text responses above a small size threshold, and confirm the client negotiates it via Accept-Encoding. Avoid double-compressing already-compressed payloads. Verify response transfer sizes drop significantly and responses still parse correctly on the client.

02. Batch inserts and updates
Find code that performs many individual INSERT or UPDATE statements in a loop where a single batched operation would work. Replace them with bulk/batched writes (multi-row inserts, batch updates, or a single statement) inside an appropriate transaction. Chunk very large batches to avoid oversized statements or long locks. Verify write-heavy operations complete far faster with fewer round trips.

03. Add a circuit breaker for slow dependencies
Identify external dependencies whose slowness or failures could cascade into the app, exhausting threads or connections while everyone waits. Add a circuit breaker that trips when a dependency is failing or too slow, fast-failing or serving a fallback until it recovers, with timeouts and limited concurrency to that dependency. Verify that a degraded dependency no longer drags down unrelated parts of the app and recovers cleanly.

04. Apply optimistic UI updates
Identify user actions (likes, toggles, adds, edits, deletes) that currently wait for the server response before updating the screen. Make them optimistic: update the UI immediately as if the action succeeded, then reconcile with the server result and roll back gracefully if it fails. Include clear error handling and a visible rollback so users aren't misled. Verify the happy path feels instant and failures restore the correct state.

05. Cache rendered pages or fragments
Find server-rendered pages or fragments whose output is identical (or nearly so) across many users and changes infrequently. Cache the rendered output and serve it directly, regenerating on a schedule or on content change, while keeping personalized regions dynamic via holes or client-side hydration. Ensure cache keys account for meaningful variations like locale. Verify these pages serve much faster and rendering load decreases.

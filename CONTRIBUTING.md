# Contributing to Stampd

Thank you for improving Stampd. Contributions should preserve tenant isolation, keep the customer experience coherent across screen sizes, and make operational behaviour easy to understand and test.

## Before you start

Read the root [`README.md`](README.md) and [`docs/architecture.md`](docs/architecture.md). Confirm whether your change affects authentication, tenant resolution, points, rewards, subscriptions, scheduled messaging, reports, or deployment configuration. These areas require focused validation because they influence security or business correctness.

## Local setup

```bash
npm install
npm run dev
```

The backend can run with its in-memory fallback during local development. Use MongoDB when you need persistence across restarts or when testing database-specific behaviour.

### macOS (Apple Silicon): one extra step

`package-lock.json` was generated on Linux, so it records only the `linux-*`
builds of the packages that ship a native binary. On an arm64 Mac, `npm ci`
therefore installs none of them and Vite dies at startup with `Cannot find
module @rollup/rollup-darwin-arm64` (or the esbuild / lightningcss /
`@tailwindcss/oxide` / sharp equivalent — they surface one at a time, so fixing
them individually turns into whack-a-mole). Install all six in a single
command, which leaves the lockfile untouched:

```bash
npm i --no-save @rollup/rollup-darwin-arm64 @esbuild/darwin-arm64 lightningcss-darwin-arm64 @img/sharp-darwin-arm64 @img/sharp-libvips-darwin-arm64 @tailwindcss/oxide-darwin-arm64
```

Re-run it after any `npm ci`, which wipes them again. Install them one at a
time and npm prunes the previous one — it has to be one command.

Regenerating the lockfile on macOS does fix this permanently, but it also
re-hoists `zod` (backend wants `^4`, frontend wants `^3`), which drags
`@hookform/resolvers` to the root against `zod@4` and breaks the frontend
typecheck. That dependency split needs resolving first — don't regenerate the
lockfile as a drive-by.

## Change guidelines

Keep HTTP concerns in route modules and reusable business rules in services. Preserve the existing middleware order and do not bypass tenant or role checks for convenience. Frontend API calls should use the existing client utilities or hooks rather than duplicating headers, error parsing, or session handling in individual views.

When changing a data model, include the corresponding service updates, seed or migration work, and tests. When changing a permission boundary, include an allowed case and a denied case. When changing a user flow, cover loading, empty, success, validation, and error states in the frontend.

## Validation checklist

Run the checks relevant to the change. At minimum, documentation-only changes should be reviewed for links, headings, and commands; frontend changes should pass the frontend type check and build; backend changes should run the focused test scripts; and cross-cutting changes should include the isolation suite.

```bash
npm run lint
npm run build
npm run test:isolation -w backend
```

If a command is intentionally not run, explain why in the pull request. Do not commit local environment files, generated build output, customer data, credentials, or debugging dumps.

## Commit messages

Use a short conventional prefix and a clear scope when useful:

```text
feat(rewards): add reward eligibility filtering
fix(auth): reject expired tenant sessions
docs(readme): document local environment setup
test(points): cover expiry at the programme boundary
```

Keep each commit focused enough to review and revert. Avoid mixing formatting-only changes with business logic unless the formatting is required for the feature.

## Pull requests

A pull request should explain the user-facing or operational outcome, describe important implementation decisions, list validation commands, and identify any environment, schema, migration, or deployment changes. Screenshots are useful for visual changes, while request and response examples are useful for API changes.

Reviewers should pay particular attention to tenant scoping, role permissions, secret handling, duplicate side effects, mobile layouts, and backward compatibility with existing records.

## Documentation changes

Update the closest documentation when a change alters setup, environment variables, route ownership, deployment, permissions, or operational procedures. Keep examples safe to copy: use placeholders, never real credentials or personal data.

# Security policy

Stampd handles authentication data, business configuration, customer profiles, loyalty balances, contact details, images, and messaging activity. Treat these records as sensitive and use non-production data for local development and testing.

## Secure development expectations

Production deployments must provide a real `MONGODB_URI` and a strong `JWT_SECRET`. Never commit credentials, private keys, access tokens, `.env` files, customer exports, or production logs. Keep browser-exposed configuration limited to values that are safe to publish, such as public API origins or browser client identifiers intended for that purpose.

Preserve authentication, authorisation, rate limiting, tenant resolution, and input validation when adding or modifying routes. Do not use the development in-memory database fallback in production. Do not expose test-only helper endpoints against a real production database.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository maintainers. Include the affected route or component, a concise description of the impact, reproduction steps that do not disclose real customer data, and any suggested mitigation. Do not open a public issue for an unpatched vulnerability or attach secrets, personal information, or production records.

The maintainers will assess the report, confirm the affected versions or deployments, coordinate a fix, and publish any necessary guidance after a remediation is available.

## Data exposure response

If a credential or sensitive record is accidentally committed, remove it from the working tree, revoke or rotate the exposed credential immediately, and notify the maintainers. Removing a file in a later commit does not make a previously exposed credential safe.

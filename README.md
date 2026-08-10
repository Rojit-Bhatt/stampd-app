# Stampd

Stampd is a multi-tenant loyalty platform for hospitality and local businesses. It gives customers a simple way to discover participating businesses, collect digital stamps, earn points, redeem rewards, and receive personalised updates. Business teams can manage customers, outlets, menus, rewards, campaigns, events, reports, staff access, and subscription limits from role-specific consoles.

The repository is organised as a private npm workspace containing an Express/Mongoose API and a React/Vite progressive web application. The API can run locally with an in-memory database fallback, while production deployments require a real MongoDB connection and explicitly configured secrets.

## Product overview

Stampd is designed around a shared platform with clear tenant boundaries. A platform administrator manages the business directory and subscription catalogue. A company owner oversees multiple outlets and consolidated reporting. Outlet staff and business administrators manage day-to-day loyalty operations. Customers use a tenant-aware account to collect stamps, track progress, redeem rewards, and interact with participating businesses.

| Area | What it provides |
| --- | --- |
| Customer experience | Tenant discovery, customer accounts, profile management, loyalty balance, stamp claims, points history, rewards, events, notifications, and review flows. |
| Business administration | Dashboard metrics, customer management, QR generation, menu management, rewards, events, campaigns, broadcasts, notifications, reports, staff, settings, and subscription status. |
| Company management | Outlet management, outlet switching, subscription visibility, cross-outlet impact metrics, and consolidated reports. |
| Platform management | Business onboarding, tenant configuration, platform analytics, audit logs, team management, subscriptions, plans, keys, and platform contacts. |
| Operational services | Email, SMS, push notifications, scheduled messaging triggers, image handling, report exports, and third-party identity or location integrations. |

## Core capabilities

### Customer loyalty

Customers can create and maintain a shared account, enter a participating tenant, earn loyalty value through QR-based claims, view their balance and history, redeem eligible rewards, and receive account or programme notifications. The claim lifecycle separates QR initiation, status polling, and authenticated fulfilment to reduce accidental duplicate awards and keep the award operation tenant-scoped.

### Multi-tenant business operations

Each business is represented by a tenant and may have one or more outlets. Tenant resolution is used for public branding, programmes, menus, and tenant-scoped authentication. Company owners can move between outlets, while outlet-level administrators and staff receive permissions appropriate to their assigned scope.

### Rewards, points, and tiers

The backend contains dedicated services for points, rewards, tiers, expiry, redemption, subscription limits, and reporting. These services keep the loyalty rules separate from HTTP route handling, making the business logic easier to test and evolve.

### Engagement and reporting

Businesses can publish campaigns, broadcasts, and events; send or schedule customer notifications; manage review links; and download operational reports. The platform also exposes impact, leaderboard, tier-distribution, transaction, customer, and company-reporting views.

### Progressive web application

The frontend is a responsive React application built with Vite and configured as a progressive web app. It includes customer, business, company, platform, shared, chart, and design-system components, with client-side routing and reusable data-fetching patterns.

## Technology stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite | Responsive customer and administration interfaces. |
| Styling | Tailwind CSS, CSS variables, Radix UI primitives | Consistent design system, accessible controls, responsive layouts, and theme tokens. |
| Client data | TanStack Query, React Router, React Hook Form, Zod | Server-state management, navigation, forms, and validation. |
| Visualisation | Visx and D3 utilities | Charts and operational analytics. |
| Backend | Node.js, Express | HTTP API, authentication, routing, scheduled tasks, and production static-file serving. |
| Persistence | MongoDB with Mongoose | Tenant, account, loyalty, subscription, reporting, and operational data. |
| Local fallback | In-memory Mongoose-compatible mock layer | Zero-configuration local development and automated route testing. |
| Authentication | JWT, bcrypt, Google identity integration | Session tokens, password hashing, and optional federated sign-in. |
| Messaging | Nodemailer, SMS provider integration, web-push | Email, text, and browser notification delivery. |
| Deployment | Render-compatible Node service and Cloudflare Workers frontend configuration | Production API hosting and optional static frontend hosting. |

## Repository layout

```text
.
├── backend/
│   ├── config/          Runtime, database, platform, and subscription configuration
│   ├── middleware/      Authentication, tenant resolution, validation, and request controls
│   ├── models/          Mongoose data models
│   ├── routes/          Express route modules grouped by product area
│   ├── services/        Business logic and integrations
│   ├── scripts/         One-off migrations and backfill utilities
│   ├── seed/            Demo and initial-data helpers
│   ├── tests/           Route and integration-oriented test scripts
│   ├── utils/           Shared helpers, token utilities, date ranges, and test support
│   └── server.js        API bootstrap and production static-file entry point
├── frontend/
│   ├── public/          PWA icons and public assets
│   ├── scripts/         Asset and tenant-branding verification utilities
│   └── src/
│       ├── components/  Shared, customer, business, company, platform, chart, and UI components
│       ├── context/     Application contexts and session state
│       ├── hooks/       Reusable client hooks
│       ├── lib/         API, utility, and client integration helpers
│       ├── routes/      Customer, business, company, and platform route views
│       ├── styles/      Feature-specific styles and design support
│       └── App.tsx      Frontend route composition and application shell
├── docs/                Architecture, operating notes, and contributor documentation
├── .github/             Issue templates and repository automation
├── package.json         Root workspace scripts
└── package-lock.json    Locked dependency graph
```

## Request and tenant model

The API is organised around explicit route groups. Public tenant and menu endpoints resolve a business from its slug. Tenant-scoped authentication establishes a normal tenant JWT. Customer account authentication is shared across tenants, after which the customer enters a tenant to receive the context required for loyalty operations.

| Prefix | Responsibility | Typical access |
| --- | --- | --- |
| `/health` | Liveness check | Public |
| `/api/platform` | Platform administration and onboarding | Platform team |
| `/api/tenant` | Public tenant branding and programme data | Public |
| `/api/menu` | Public tenant menu data | Public |
| `/api/auth` | Tenant-scoped customer and business authentication | Public/authenticated |
| `/api/customer-auth` | Shared customer identity and tenant entry | Public/authenticated |
| `/api/claim` | QR claim lifecycle and stamp fulfilment | Mixed, tenant-authenticated for fulfilment |
| `/api/admin-auth` | Unified staff and business-admin login flows | Public/authenticated |
| `/api/company` | Company-owner outlet and roll-up operations | Company owner |
| `/api/admin` | Outlet administration and loyalty operations | Business admin/staff |
| `/api/points` | Customer earning, redemption, balance, and history | Customer |
| `/api/reviews` | Review-related operations | Public/authenticated |
| `/api/tools` | Public supporting tools, including location lookup proxies | Public |
| `/api/images` | Public image delivery for browser image requests | Public |
```

A visual overview of the service boundaries and deployment shape is available in [`docs/architecture.md`](docs/architecture.md).

## Prerequisites

Use the following local tools before installing dependencies:

| Requirement | Recommended baseline |
| --- | --- |
| Node.js | 20 or newer; the project is currently exercised with Node.js 22. |
| npm | Included with Node.js; npm workspaces are used at the repository root. |
| MongoDB | Optional for local development; required for production. |
| Git | Required for source control and contribution workflows. |

## Quick start

Clone the repository and install all workspace dependencies from the root:

```bash
git clone https://github.com/Rojit-Bhatt/stampd-app.git
cd stampd-app
npm install
```

Start the backend and frontend together:

```bash
npm run dev
```

The default local addresses are:

| Service | Address |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:5001` |
| API health check | `http://localhost:5001/health` |

When `MONGODB_URI` is not defined and `NODE_ENV` is not `production`, the backend uses its in-memory fallback. This is convenient for development and route testing, but data is ephemeral and must not be treated as a persistent environment.

## Environment configuration

Copy the example file before starting a configured local environment:

```bash
cp backend/.env.example backend/.env
```

The backend loads environment values from `backend/.env`. The frontend reads build-time values from `frontend/.env` when a separate frontend process or deployment is used.

### Backend variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Recommended | Use `development`, `test`, or `production`. Production enables strict secret and database checks. |
| `PORT` | Optional | API port. Defaults to `5001` locally and `3000` in production. |
| `MONGODB_URI` | Production | MongoDB connection string. Omit locally to use the in-memory fallback. |
| `JWT_SECRET` | Production | Secret used to sign and verify session tokens. Use a long, random value. |
| `FRONTEND_ORIGINS` | Production | Comma-separated list of trusted frontend origins for CORS. |
| `SEED_DEMO_DATA` | Optional | Set to `true` to seed demo data, or `false` to disable automatic demo seeding. |
| `PLATFORM_ADMIN_EMAIL` | Optional | Email for creating the initial platform administrator during startup. |
| `PLATFORM_ADMIN_PASSWORD` | Optional | Password paired with the initial platform administrator email. |
| Provider credentials | Feature-dependent | Email, SMS, push, Google identity, and location integrations should be configured only in the deployment environment that uses them. |

Production startup intentionally exits when `JWT_SECRET` or `MONGODB_URI` is missing. This prevents a production service from starting with development-only authentication or test-only persistence behaviour.

### Frontend variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Deployment-dependent | Base URL used by the browser to call the API when frontend and backend are hosted separately. |
| `VITE_GOOGLE_CLIENT_ID` | Feature-dependent | Browser client identifier for Google sign-in when that flow is enabled. |

Do not commit `.env`, `.env.local`, or other secret-bearing files. Use the checked-in example file as a naming reference only.

## Available commands

Run commands from the repository root unless a workspace is specified.

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the backend and frontend development servers together. |
| `npm run build` | Builds the frontend for production. |
| `npm start` | Starts the backend in production mode. |
| `npm run lint` | Runs the frontend TypeScript check. |
| `npm run test -w backend` | Runs the backend test suite defined by the backend workspace. |
| `npm run test:integration -w backend` | Runs the integration QA flow. |
| `npm run test:isolation -w backend` | Verifies tenant isolation behaviour. |
| `npm run test:points -w backend` | Runs points earning, redemption, and expiry tests. |
| `npm run test:campaigns -w backend` | Runs campaign and reward-catalog tests. |
| `npm run build -w frontend` | Builds only the frontend workspace. |
| `npm run lint -w frontend` | Type-checks only the frontend workspace. |

## Testing strategy

The backend test suite is composed of focused Node scripts rather than a single test runner. Tests cover authentication, account settings, tenant isolation, customer identity, claims, points, rewards, campaigns, messaging, notifications, subscriptions, staff roles, reports, images, public endpoints, and platform administration.

For a change that touches tenant resolution, authentication, loyalty calculations, subscription limits, or permissions, run the focused test group and the isolation suite. For frontend changes, run the TypeScript check and production build. For route changes, also verify the `/health` endpoint and at least one authenticated and one public request path.

## Production deployment

The backend can serve the built frontend when `NODE_ENV=production`. A typical single-service deployment is:

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

The backend process must receive a production MongoDB URI, a strong JWT secret, the allowed frontend origins, and any credentials required by enabled integrations. If the frontend is deployed separately, build it with the correct `VITE_API_BASE_URL` and configure the API’s `FRONTEND_ORIGINS` to include the deployed frontend origin.

The repository also contains `frontend/wrangler.jsonc` for a static frontend deployment path. That option still requires the API to be hosted separately and reachable from the browser.

## Security and data handling

Authentication and authorisation are enforced through route middleware and role-aware services. Passwords are hashed before persistence, session tokens are signed with `JWT_SECRET`, rate limiting is enabled for sensitive flows, and production rejects missing database or token configuration.

Treat customer profiles, loyalty balances, contact information, uploaded images, and messaging data as sensitive business data. Do not include real customer data in fixtures, screenshots, pull requests, or local seed changes. Report suspected vulnerabilities privately to the repository maintainers rather than opening a public issue with exploit details.

## Development conventions

Keep route modules thin and place reusable business rules in `backend/services`. Put persistence shape changes in models and migrations or backfill scripts where necessary. Preserve tenant scoping at every layer: route, middleware, service, query, report, and test. Prefer focused changes that can be covered by an existing test group.

Frontend features should be placed in the closest domain directory, with reusable primitives remaining in shared or UI components. Keep API calls and response normalisation in `frontend/src/lib` or dedicated hooks rather than duplicating request logic inside view components. Preserve the existing design tokens and responsive behaviour when adding screens.

Commit messages should use a short conventional prefix such as `feat`, `fix`, `refactor`, `docs`, `test`, `build`, or `chore`, followed by a concise scope and description. Pull requests should explain the user-facing outcome, list validation commands, and call out environment or migration changes.

## Troubleshooting

If the frontend cannot reach the API, confirm that the backend is running on port `5001`, that the frontend is using the expected API base URL, and that the origin is included in `FRONTEND_ORIGINS` when a non-default origin is used. If the backend exits in production, inspect the startup logs for missing `MONGODB_URI` or `JWT_SECRET`. If local data unexpectedly disappears, confirm whether the in-memory fallback is active and switch to MongoDB for persistence.

If a test fails after a schema or service change, run the failing script directly from `backend` and inspect the first failing request rather than rerunning the entire suite repeatedly. Keep test data isolated and reset the in-memory state between scenarios where required.

## Documentation map

| Document | Purpose |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | System boundaries, request flow, deployment shape, and ownership rules. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution workflow, local validation, and pull-request expectations. |
| [`SECURITY.md`](SECURITY.md) | Responsible security reporting and operational handling guidance. |
| [`backend/.env.example`](backend/.env.example) | Safe configuration template for backend development and deployment. |

## License

No open-source licence is currently declared in this repository. Until the maintainers add a licence file, the source should be treated as proprietary and should not be redistributed or reused outside the permissions granted by the repository owner.

## References

[1]: https://nodejs.org/en/learn/getting-started/introduction-to-nodejs "Node.js documentation"
[2]: https://expressjs.com/ "Express documentation"
[3]: https://www.mongodb.com/docs/ "MongoDB documentation"
[4]: https://vite.dev/guide/ "Vite guide"
[5]: https://react.dev/learn "React documentation"
[6]: https://docs.npmjs.com/cli/v10/using-npm/workspaces "npm workspaces documentation"

The technology descriptions in this document are aligned with the repository manifests and entry points; the linked references provide the corresponding upstream project documentation.

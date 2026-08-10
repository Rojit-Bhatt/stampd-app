# Stampd architecture

This document explains how the Stampd workspaces fit together and where new functionality should live. It complements the setup and operating instructions in the root [`README.md`](../README.md).

## System shape

Stampd is a two-workspace application with a shared product model:

```text
Browser / PWA
    │
    │  JSON over HTTP, JWT, tenant context
    ▼
Express API
    ├── Public tenant, menu, image, review, and tool endpoints
    ├── Customer identity and tenant-entry flows
    ├── Business, company, and platform administration
    ├── Loyalty claims, points, rewards, tiers, and reporting
    ├── Messaging, notifications, images, and scheduled triggers
    └── MongoDB through Mongoose
```

In a single-service production deployment, the API serves `frontend/dist` after the frontend has been built. In a split deployment, the frontend is hosted as static assets and calls the API through `VITE_API_BASE_URL`.

## Workspace responsibilities

| Workspace | Owns | Should not own |
| --- | --- | --- |
| `frontend` | Rendering, navigation, client-side session state, forms, responsive layouts, charts, PWA behaviour, and browser-side API calls. | Secrets, direct database access, loyalty calculations that must be trusted, or authorisation decisions. |
| `backend` | Authentication, tenant resolution, authorisation, business rules, persistence, reports, integrations, scheduled work, and production serving. | Presentation-specific layout or browser-only state. |
| `docs` | Product, architecture, operation, and contribution guidance. | Runtime logic or secrets. |

## Tenant and identity boundaries

There are three important identity contexts:

1. **Platform context** is used by the platform team to onboard and govern businesses, manage subscription plans and keys, inspect audit data, and maintain platform-wide configuration.
2. **Company context** is used by a company owner to manage multiple outlets and view consolidated business information.
3. **Tenant context** is used by outlet-level administrators, staff, and customers for operations belonging to one business or outlet.

Customer identity is shared across participating tenants. Entering a tenant is a deliberate context exchange: the customer account is global, but the resulting loyalty actions are tenant-scoped. This distinction should be preserved when adding authentication, profile, rewards, or reporting features.

## Request flow

A typical customer loyalty request follows this sequence:

1. The browser determines the current tenant from the route, slug, or stored session context.
2. The frontend calls the API through the shared client utilities.
3. CORS and JSON middleware process the request.
4. Authentication middleware validates the JWT when the endpoint is protected.
5. Tenant middleware resolves the tenant and checks that the authenticated identity can act within it.
6. The route validates request input and delegates to a service.
7. The service performs the business operation and persistence queries.
8. The route returns a stable JSON response for the frontend.

The route layer should remain responsible for HTTP concerns. Services should own calculations, state transitions, side effects, and reusable policy checks.

## Backend layering

| Layer | Location | Responsibility |
| --- | --- | --- |
| Bootstrap | `backend/server.js` | Loads configuration, registers middleware and routes, connects persistence, schedules triggers, seeds configured data, and serves the frontend in production. |
| Configuration | `backend/config` | Database, platform, subscription, and runtime settings. |
| Middleware | `backend/middleware` | Authentication, tenant resolution, validation, rate limiting, and request-level policy. |
| Routes | `backend/routes` | HTTP endpoints grouped by domain. |
| Services | `backend/services` | Business rules, persistence orchestration, integration calls, and reusable workflows. |
| Models | `backend/models` | Mongoose schemas and persistence-level constraints. |
| Scripts | `backend/scripts` | Explicit migrations, backfills, and data repair operations. |
| Tests | `backend/tests` | Focused behavioural, integration, security, and isolation checks. |

## Data and isolation principles

Every tenant-scoped query must be constrained by the resolved tenant or outlet context. A feature is not complete when it works for the happy path only; it must also demonstrate that one tenant cannot read or mutate another tenant’s customers, points, rewards, menus, reports, or staff records.

When a schema changes, update the model, service assumptions, seed data where appropriate, and tests. If existing records need transformation, add a focused script under `backend/scripts` and document how it is run. Avoid silent data-shape changes inside request handlers.

## Scheduled work and side effects

The backend starts scheduled messaging triggers through the server bootstrap. Scheduled functions should be safe to run more than once, should scope their queries carefully, and should record enough context to diagnose failures. External delivery failures should not corrupt the underlying loyalty transaction; use explicit status fields or retryable workflows where a side effect is not instantaneous.

## Frontend organisation

Frontend route views are divided by product context under `frontend/src/routes`. Components belong in the nearest domain directory when they are feature-specific and in `frontend/src/components/shared` or `frontend/src/components/ui` when they are reusable. API access and response shaping should remain in `frontend/src/lib` or hooks so route views stay focused on composition and interaction.

The visual system uses CSS variables and shared utility conventions. New screens should reuse existing tokens, typography, spacing, motion, and responsive patterns rather than introducing one-off values. Accessibility, touch targets, narrow-screen layouts, and loading or empty states are part of the feature definition.

## Deployment modes

### Single service

Build the frontend and start the backend with `NODE_ENV=production`. The backend serves the generated frontend assets and continues to expose `/api/*` and `/health`.

### Split frontend and API

Build the frontend as static assets, configure `VITE_API_BASE_URL` to the public API origin, and set `FRONTEND_ORIGINS` on the backend to the exact frontend origin or origins. This mode is useful when the frontend and API have separate release cycles.

## Adding a feature

A feature should normally follow this path:

1. Define the tenant, role, and data-access rules before writing the UI.
2. Add or update the model and a service-level operation.
3. Add the route with input validation and the correct authentication middleware.
4. Add focused tests, including a cross-tenant denial case when the feature is tenant-scoped.
5. Add the API client helper or hook and then compose the frontend view.
6. Update the README or a focused document when the feature changes setup, deployment, permissions, or operating procedures.

## Architectural risks to watch

The most important risks are accidental cross-tenant access, running production without real persistence, leaking secrets into frontend builds or logs, duplicating loyalty calculations in the browser, and making external notification delivery part of an unprotected database transaction. Pull requests that touch these areas should include explicit validation notes.

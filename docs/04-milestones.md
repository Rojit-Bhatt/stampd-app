# Document 04: Vertical Feature Milestones & Acceptance Criteria

## Milestone 1: Project Setup & Base Architecture
Scaffold the monorepo workspace environment, configure runtime processes, and establish the persistent database connection layers.
* **Acceptance Criteria:**
    * [ ] Backend running via Node/Express with an active cloud or local MongoDB connection.
    * [ ] Frontends (Customer & Admin) initialized via Vite + React.
    * [ ] Shared Tailwind CSS theme configured using the custom color palette.
    * [ ] Server contains global base error handling and uniform JSON structural response middleware.

## Milestone 2: Authentication Infrastructure
Build end-to-end registration, login, and token processing flows for both roles.
* **Acceptance Criteria:**
    * [ ] Database securely stores passwords using Bcrypt hashing keys.
    * [ ] JWT middleware rejects calls missing authentic authorization payload strings.
    * [ ] Routing middleware successfully blocks regular customers from administrative paths.
    * [ ] Integration tests verify that valid inputs yield clean login structural tokens.

## Milestone 3: Customer Loyalty Dashboard Layout
Develop the user-facing workspace interface showing stamp progression tracking indicators.
* **Acceptance Criteria:**
    * [ ] Mobile viewport layout properly renders 5 visual punch cards.
    * [ ] State elements display active icons for accumulated counts and blank placeholders for empty slots.
    * [ ] The application retrieves profile card states via TanStack Query on load.

## Milestone 4: Admin Generation Console
Construct the barista operations screen panel handling dynamic token generation cycles.
* **Acceptance Criteria:**
    * [ ] Clicking the action button yields a temporary UUID v4 token saved to the database.
    * [ ] The screen displays a working 30-second visual count indicator.
    * [ ] The token document disappears from the database automatically upon timeout validation.

## Milestone 5: Camera Scanning Mechanics
Build the real-time device scanning component using video feedback loops.
* **Acceptance Criteria:**
    * [ ] The customer dashboard opens a clean modal screen running native hardware camera paths.
    * [ ] The scanner parses incoming targets and converts them to standard payload string texts.
    * [ ] The user interface presents legible error toast callouts if camera authorization permissions are blocked.

## Milestone 6: Core Stamp Logic Engine
Write the backend business rules managing structural state increments and constraints.
* **Acceptance Criteria:**
    * [ ] Submitting an expired or already-used token returns an explicit HTTP 400 rejection state.
    * [ ] The backend prevents multiple stamps within an 18-hour window for the same user account.
    * [ ] Database calls run atomically to prevent concurrent race-condition stamp updates.

## Milestone 7: Automated Voucher Milestone Operations
Connect the automation loop that handles state transitions when users fill their stamp cards.
* **Acceptance Criteria:**
    * [ ] Reaching 5 stamps automatically sets the user's `stampsEarned` count back to 0.
    * [ ] A unique 8-character voucher code string prefixed with `CAFE-` is generated simultaneously.
    * [ ] The customer app flashes a custom congratulatory reward screen layout.

## Milestone 8: Barista Voucher Redemption Flow
Build the secure interface loop that converts active digital vouchers into physical coffee.
* **Acceptance Criteria:**
    * [ ] The Admin app provides an alphanumeric input form or scanner utility to check voucher codes.
    * [ ] Submitting a valid active code changes the database record to `isValid: false`.
    * [ ] Submitting an already-redeemed voucher returns a red error warning window.

## Milestone 9: Full-System Verification Tests
Verify the overall health, performance, and reliability of the platform's features under simulated application conditions.
* **Acceptance Criteria:**
    * [ ] Automated scripts simulate 5 consecutive valid daily scans to confirm flawless automated voucher generation.
    * [ ] Simultaneous concurrent scan double-taps are successfully blocked, allowing only 1 stamp credit.
    * [ ] Code compilation completes zero linting issues or layout processing breaks.

## Milestone 10: Production Infrastructure Deployment
Launch the applications onto cloud platform systems for public network operations.
* **Acceptance Criteria:**
    * [ ] The backend API is deployed to production with fully operational CORS security rules.
    * [ ] Both frontend environments are hosted publicly and optimized for fast asset delivery.
    * [ ] Production database instances run securely with production-grade environment variables.

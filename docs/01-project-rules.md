Markdown
# Document 01: Project Governance, Rules, & Folder Ownership

## 1. Project Rules
* **Dependency Control:** Never introduce a new NPM package unless absolutely necessary and explicitly approved.
* **Structural Integrity:** Do not alter the directory tree or folder paths once established.
* **Component Hygiene:** Reuse existing UI components. Do not write duplicate UI implementations for tables, inputs, buttons, or layouts.
* **Logic Isolation:** Never duplicate business rules across frontends. The backend server is the single source of truth for validation.
* **Thin Controllers:** Controllers must only extract parameters, hand them off to services, and format the HTTP response.
* **Service Layer Focus:** All core operational computations, DB state evaluations, and logic conditions must reside inside dedicated Service classes or files.
* **Environment Variables:** Never hardcode URLs, ports, or credentials. Use strict environment variable processing (`process.env` / `import.meta.env`).
* **Milestone Discipline:** Do not alter code blocks written for completed milestones unless debugging a regression.

## 2. Development Workflow Loop
The AI Agent must follow this execution sequence precisely for every milestone:
1. Read the comprehensive system blueprint context file.
2. Read the designated target milestone requirements block.
3. Write code **only** to fulfill the active target milestone requirements.
4. Execute validation routines and run written suite tests.
5. Fix lint errors and formatting structural breaks.
6. Commit the changes and update progress documentation files.
7. **STOP.** Do not automatically advance to the next milestone until explicitly instructed by the operator.

## 3. Folder Ownership & Boundaries

### `/backend` Hierarchy
* `routes/`: Express routing mapping definitions only. No business evaluations.
* `controllers/`: HTTP request parsers, response formatters, and status code throwers.
* `services/`: Primary home for business logic, multi-model updates, and data transformations.
* `models/`: Direct Mongoose schemas and structural indexing setups.
* `middleware/`: Authentication verification, rate limiting, and request validations.
* `utils/`: Pure helper functions (date calculations, string generators).

### `/frontend` Client Hierarchy (Both apps)
* `pages/`: Primary high-level view screen containers tied to router states.
* `components/`: Modular, atomic, stateless or UI-state-only presentation blocks.
* `context/`: Global application state engines (e.g., Auth context).
* `hooks/`: Specialized data fetching custom hooks wrapping TanStack Query calls.

## 4. Frontend State Architecture
Ensure complete consistency across views by using these specific tools for data and client-side logic:
* **User Session Authentication:** Native React Context API.
* **Server Data & API Syncing:** TanStack Query (`@tanstack/react-query`) for query caching, mutations, and automated cache invalidation.
* **Form Management:** React Hook Form for performance-optimized UI bindings.
* **Input Data Validation:** Zod schemas shared structurally across fields.
* **User Notifications:** React Hot Toast for UI alerting feedback loops.
* **Local Component UI States:** Standard native `useState` hooks.

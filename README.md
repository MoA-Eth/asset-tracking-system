# Federal Democratic Republic of Ethiopia – Ministry of Agriculture (MoA)
## Asset Tracking System (MoA-ATS) — IFMIS Mirror Platform

A modern, enterprise-grade asset tracking system and REST API built to mirror the Ethiopian Government's **Integrated Financial Management Information System (IFMIS)**. Implements statutory Ethiopian property management vouchers (**Model 19**, **Model 20**, **Model 22**), dual Gregorian/Ethiopian calendar synchronization, and role-based access control.

---

## 📁 Repository Structure (`@MoA-Eth` Monorepo Standard)

```text
asset-tracking-system/
├── backend/                  # Express.js REST API + Prisma ORM + PostgreSQL
│   ├── prisma/               # Database schema definitions & migrations
│   ├── src/                  # Controllers, routes, middleware, RBAC & calendar engine
│   └── .env.example          # Backend environment configuration template
│
├── frontend/                 # React 18 (TypeScript) + Vite + Tailwind CSS
│   ├── src/                  # Components, pages, dual calendar & print voucher forms
│   └── .env.example          # Frontend environment configuration template
│
├── docs/                     # Specifications and technical documentation
├── package.json              # Monorepo workspace runner
└── README.md                 # Root repository overview (this file)
```

**User manual:** in the app under **Help** (account menu, below Profile). The guides are Markdown files in [frontend/src/docs/](frontend/src/docs/), built into the app, so they work offline and match the running version. Update the matching guide when a screen changes.

**Deploying:** install and run a server with [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); releases go out through Jenkins as in [docs/CI-CD.md](docs/CI-CD.md).

---

## 🚀 Run it locally

Two ways: **A. Node + PostgreSQL** (for development, with hot reload) or **B. Docker** (the same containers the servers run). Neither needs a certificate: HTTPS and nginx are only used on staging and production.

### A. Development (Node + PostgreSQL)

**You need:** Node.js 20 or newer (with npm) and PostgreSQL 15 or newer running on `localhost:5432`.

```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git
cd asset-tracking-system

# 1. Environment files (Windows PowerShell: use  copy  instead of  cp)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. In `backend/.env`, set `DATABASE_URL` to your PostgreSQL user and password (the default is `postgres:postgres`). `JWT_SECRET` can stay empty while developing, but then everyone is signed out whenever the backend restarts.

```bash
# 3. Install everything (run from the repository root)
npm run install:all

# 4. Create the database tables and the demo data (PostgreSQL must be running)
npm run db:setup

# 5. Start the API and the web app together
npm run dev
```

Open **http://localhost:3001** (the API is at http://localhost:3000/api, health check at `/api/health`). Sign in with a demo account from [Roles, Credentials & Access Matrix](#-roles-credentials--access-matrix), all with password `moaams2024`, for example `admin@moa.gov.et` or `encoder@moa.gov.et`.

| Command (from the repository root) | What it does |
|---|---|
| `npm run dev:backend` / `npm run dev:frontend` | Start only the API or only the web app |
| `npm run db:push` | Apply schema changes to the database |
| `npm run db:seed` | Add the demo users and store items again |
| `npm run db:studio` | Browse the database at http://localhost:5555 |

### B. Docker (database, API and nginx)

**You need:** Docker with Docker Compose (e.g. Docker Desktop). Node.js and PostgreSQL are not required on your host machine.

```bash
# 1. Create your local environment configuration file
# macOS / Linux:
cp .env.example .env

# Windows PowerShell:
copy .env.example .env
```

2. Open `.env` and configure your local settings:
   - `POSTGRES_PASSWORD`: Set a database password (letters and numbers only).
   - `JWT_SECRET`: A random string of at least 32 characters (e.g. generated via `openssl rand -hex 32`).
   - `ADMIN_EMAIL` & `ADMIN_PASSWORD`: Your initial System Administrator credentials (password must be at least 12 characters with letters and numbers).
   - *(Optional)* `LOCAL_PORT`: Defaults to `3000`. Change if port 3000 is already in use on your machine.

```bash
# 3. Build images and start all containers in the background
npm run docker:local

# (Or directly with Docker Compose if npm is not installed):
docker compose -p moa-ams-local -f docker-compose.yml -f docker-compose.local.yml up -d --build

# 4. (Optional) Seed demo accounts and test data into the Docker database
npm run docker:local:seed

# 5. Stop when finished (preserves your local database volume)
npm run docker:local:down
```

Open **http://localhost:3000** (API health check at `http://localhost:3000/api/health`).
- If you ran `npm run docker:local:seed`, you can sign in using demo accounts (e.g. `superadmin@moa.gov.et`, `admin@moa.gov.et`, `encoder@moa.gov.et`) with uniform password `moaams2024`.
- Or sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you configured in `.env`.

### Troubleshooting

| Problem | Fix |
|---|---|
| `npm run db:setup` can't connect | PostgreSQL isn't running, or `DATABASE_URL` in `backend/.env` has the wrong user, password or port. |
| Browser shows a certificate warning, or a redirect to `https://` | You opened a server address. Use `http://localhost:3001` (option A) or `http://localhost:3000` (option B). If the browser remembered HTTPS for localhost, open `chrome://net-internals/#hsts` and delete `localhost`. |
| Port 3000 or 3001 is in use | Stop what uses it; for option B set `LOCAL_PORT` in `.env`. |
| Signed out after every backend restart | Set `JWT_SECRET` in `backend/.env`. |

---

## 🧪 Testing with Vitest (Unit & Integration Tests)

The system utilizes **[Vitest](https://vitest.dev/)** as the unified, high-performance unit test runner for both the frontend and backend, structured in alignment with the **Livescan** test architecture standard.

### Test Suites Overview (882 Automated Unit Tests + 87 Integration Assertions)

The platform features an automated test suite comprising **882 tests across 98 suites**, covering statutory workflows, dual-calendar calculations, authorization matrix gating, and API contracts.

- **Backend Unit & Integration Tests (`backend/src/**/*.test.ts`)** — *424 Tests / 37 Suites*:
  - **Statutory Workflow Engines**: Model 19 (GRN), Model 20 (Issue), Model 21 (Transfer), and Model 22 (Return).
  - **Multi-Stage Approvals**: Two-tier endorsement and approval segregation.
  - **Security & Authorization**: Granular RBAC matrix evaluation, password lifecycle, account lockout, rate limiting, and request logging.
  - **API Documentation**: OpenAPI 3.0 / Swagger schema specification validation.
  - **Ethiopian Date Engine** (`eth-date.test.ts`): Julian Day Number calculations, Pagume leap year rules, and GC ↔ EC conversions.

- **Frontend Unit Tests (`frontend/src/**/*.{test,spec}.{ts,tsx}`)** — *458 Tests / 61 Suites*:
  - **Dual Calendar Engine** (`eth-date.test.ts`): Bidirectional Gregorian ↔ Ethiopian calendar transformations, Meskerem 1 New Year boundary, Pagume 5 vs 6 days, and ETB currency formatting.
  - **Role-Based Access & SOD** (`role-guards.test.ts` & `rbac-matrix-enforcement.test.tsx`): Role tab navigation, landing tab resolution, and privilege restrictions.
  - **Approvals & Queue Logic** (`approvals-workflow.test.ts`): Stage 1 vs Stage 2 queue filtering, batch selection safety, and multi-field search.
  - **Statutory Vouchers** (`CustodyVoucherModal.test.tsx`, `Model19PrintModal.test.tsx`, `Model21PrintModal.test.tsx`, `Model22PrintModal.test.tsx`, `DisposalPrintModal.test.tsx`): Certificate rendering and printing.
  - **Executive Dashboard** (`ExecutiveDashboardPage.test.tsx`): Store filters, fiscal periods, category breakdowns, and analytics chips.
  - **In-App Staff User Manual** (`DocsPage.test.tsx`): 12 topic guides, live search, and categorization.

- **Backend Integration Tests (`backend/test-*.js`)** — *87 Assertions*:
  - `test-critical-flows.js`: End-to-end 2-stage inbound stock-in, outbound stock-out, custody transfer, and SOD enforcement.
  - `test-status-consistency.js`: Atomic status lifecycle, stage sequencing, concurrency locks, and audit trail permanence.

---

### 📚 Interactive API Documentation (Swagger / OpenAPI 3.0)

The system includes built-in interactive OpenAPI 3.0 documentation:
- **Interactive Portal**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **Raw OpenAPI JSON Spec**: [http://localhost:3000/api/docs/json](http://localhost:3000/api/docs/json)

Documents all endpoint parameters, request schemas, Bearer JWT authentication, and response models — and the
API-key endpoint other systems use to read the key figures (see [Integrations](#-integrations-reading-the-key-figures-with-an-api-key)).

---

### 🛡️ Security, Reliability & Quality Architecture

- **Two-Tier Rate Limiting**: Global API limiter (300 req/min per IP) and strict authentication limiter (30 req/15min per IP) via `express-rate-limit`.
- **Structured Latency Logging**: Real-time request logging recording timestamp, HTTP method, URL, status code, client IP, and latency via `process.hrtime.bigint()`.
- **HTTP Response Compression**: Gzip/Brotli compression middleware (`compression`) reducing payload sizes by 60–80%.
- **Database Query Indexing**: Full composite and targeted indexes across PostgreSQL tables (`items`, `transaction_approvals`, `item_history`, `employees`).
- **Enhanced HTTP Security Headers**: `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Permitted-Cross-Domain-Policies: none`, `X-Frame-Options: SAMEORIGIN`, `nosniff`, and HSTS.
- **Production Health Probes**:
  - `GET /api/health/live`: Container liveness check (`{ status: "alive" }`).
  - `GET /api/health/ready`: Database connectivity readiness probe (`{ status: "ready" }`).
  - `GET /api/health`: Comprehensive system diagnostic.
- **Graceful Shutdown**: Intercepts `SIGTERM` and `SIGINT` to drain in-flight requests and cleanly close database connections.
- **ESLint & Husky Pre-Commit Enforcers**: Modern ESLint flat configs and Git hooks executing `npm run lint` and `npm run test:backend` before any commit.

---

### 📋 Steps to Run Tests

#### 1. Run Complete Unit Test Suite (Backend + Frontend)
Execute from the root directory (`asset-tracking-system/`):
```bash
npm test
```
*(Runs both backend and frontend Vitest suites sequentially in ~4 seconds).*

#### 2. Run Backend Unit Tests Only
```bash
# From root:
npm run test:backend

# Or from backend directory:
cd backend
npm test
```

#### 3. Run Frontend Unit Tests Only
```bash
# From root:
npm run test:frontend

# Or from frontend directory:
cd frontend
npm test
```

#### 4. Run Tests in Interactive Watch Mode
To run tests continuously as you edit code:
```bash
# For backend tests:
cd backend
npm run test:watch

# For frontend tests:
cd frontend
npm run test:watch
```

#### 5. Run Backend API Integration Tests
Ensure the PostgreSQL database and backend server are running, then execute from the root directory:
```bash
npm run test:integration
```

---

### ✍️ Steps to Add New Tests

The project follows the co-located testing convention from the **Livescan** architecture.

#### Step 1: File Placement & Naming
- **Utilities / Business Logic**: Create `<filename>.test.ts` next to the implementation file (e.g. `src/utils/my-util.test.ts` or `src/services/my-service.test.ts`).
- **React Components / Hooks**: Create `<ComponentName>.test.tsx` next to the component (e.g. `src/components/ui/MyComponent.test.tsx`).

#### Step 2: Boilerplate Structure
Use Vitest's global methods (`describe`, `it`, `expect`, `vi`):

```typescript
import { describe, expect, it } from 'vitest';
import { myHelperFunction } from './my-helper';

describe('myHelperFunction', () => {
  it('handles standard input correctly', () => {
    const result = myHelperFunction('valid-input');
    expect(result).toBe(true);
  });

  it('rejects invalid or empty input safely', () => {
    expect(myHelperFunction('')).toBe(false);
  });
});
```

#### Step 3: Testing React Components with Providers
When testing UI components that require Toast or Authentication context, use `renderWithProviders` from `src/test/renderWithProviders`:

```tsx
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MyActionButton } from './MyActionButton';

describe('<MyActionButton />', () => {
  it('renders and triggers action on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyActionButton label="Endorse" />);

    const button = screen.getByRole('button', { name: /endorse/i });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(screen.getByText(/success/i)).toBeInTheDocument();
  });
});
```

#### Step 4: Verify and Validate
Run the test command to verify your new test passes with zero failures:
```bash
npm test
```
Verify that the production build passes type-checking:
```bash
npm run build
```

## 🔑 Roles, Credentials & Access Matrix

All test accounts use uniform password **`moaams2024`**.

> **5 statutory roles** (plus the **Employee** role, which only sees the assets assigned to the person) implement strict Segregation of Duties (SOD) — operational entry, technical endorsement, statutory authorization, and platform governance are strictly decoupled.

| # | Role | Email / Payroll ID | Title | Default View | Accessible Tabs | Access Scope & Responsibilities |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 0 | **`SUPER_ADMIN`** | `superadmin@moa.gov.et` / `00000001` | Super Administrator (ዋና አስተዳዳሪ) | Dashboard | Enterprise Management Tabs (`Dashboard`, `Assets`, `Approvals`, `Reports`, `Audit Log`, all `Settings`) | **Break-Glass Master Operator**: Full administrative and operational clearance across all store workflows (Model 19/22/21/Disposal), dual-stage approvals (Stage 1 technical endorsement & Stage 2 final authorization up to and exceeding 10M ETB), reports, audit log, and system configuration. |
| 1 | **`DATA_ENCODER`** | `encoder@moa.gov.et` | Store Custodian / Encoder | Assets | `Assets`, `Reports`, reference `Settings` (excluding Users/Roles/System) | **Operational Ingestion & Requisition**: Registers Model 19 (GRN), submits Model 22 (Issue), initiates inter-store transfers & Model 21 Returns, and requests disposals. *(Strict SOD: Forbidden from approving vouchers).* |
| 2 | **`TEAM_LEADER`** | `teamleader@moa.gov.et` | Team Leader | Approvals | `Approvals`, `Assets` (read-only), `Reports`, `Audit Log`, reference `Settings` | **Stage 1 Endorsement**: Verifies technical specifications and records Stage 1 Endorsements before advancing to Stage 2. Full read access to operational reports and audit trail. |
| 3 | **`DEPARTMENT_HEAD`** | `depthead@moa.gov.et` | Directorate Head | Approvals | `Approvals`, `Assets` (read-only), `Reports`, `Audit Log`, reference `Settings` | **Stage 2 Final Authorization**: Final statutory sign-off that commits stock transitions (`AVAILABLE`, `ISSUED`, `DISPOSED`) for requests up to 10M ETB. |
| 4 | **`CHIEF_DIRECTOR`** | `chiefdirector@moa.gov.et` / `executivedirector@moa.gov.et` | Chief / Executive Director | Approvals | `Approvals`, `Dashboard`, `Assets` (read-only), `Reports`, `Audit Log`, reference `Settings` | **High-Value Stage 2 Authorization**: Authorizes high-value transactions exceeding 10,000,000 ETB, with executive overview across the ministry portfolio. |
| 5 | **`MANAGER`** | `manager@moa.gov.et` | Manager | Dashboard | `Dashboard`, `Reports` | **Executive Oversight**: Read-only executive view over total ministry portfolio valuation, directorate allocations, custodian ratios, and store capacities, plus read-only operational reports. Isolated from store operations. |
| 6 | **`SYSTEM_ADMIN`** | `admin@moa.gov.et` | System Administrator | Dashboard | `Dashboard`, `Reports`, `Audit Log`, `Settings` | **IT & Security Governance**: Manages user accounts, assigns system roles, configures stores and system parameters. *(Strict SOD: Blocked from store operations & approving vouchers).* |
| 7 | **`EMPLOYEE`** | `almaz.a@moa.gov.et` | Employee | My assets | `My assets` | **Self-service, read-only**: sees only the assets issued to them (serial number, when and on which slip, pending transfer or return). Nothing about anyone else; isolated from staff-wide pages. |

---

## Roles administration

The implemented **Settings → Roles** directory shows the system roles (including Super Administrator and System Administrator), permissions, live member counts, and links to filtered user assignments. Users and Roles are restricted to System Administrators. See [Roles setup and behavior](docs/ROLES.md) for the database upgrade and session changes.

## 🔌 Integrations: reading the key figures with an API key

Another system's **server** (for example the Ministry KPI dashboard) can read this app's key figures with an API key,
without anyone signing in. A key is **read-only** and opens **one endpoint only**, `GET /api/v1/assets-dashboard`, which returns
numbers — no item lists, no names. Every other endpoint still needs a signed-in person.

### For administrators: issue a key

1. Sign in as a **System Administrator** or **Super Administrator** (others don't see the page).
2. Go to **Settings → System → API keys → New key**.
3. Enter the **service** that will hold it (e.g. *Ministry KPI dashboard*) and, if wanted, an **expiry date**
   (empty = works until revoked). Press **Create key**.
4. **Copy the key now** — it looks like `ats_live_8f3k2q9a1b2c_…` and is shown **only once** (only a hash is stored).
   Send it securely to that service's developer, with the API documentation link below.

Good practice:

- **One key per service**, so each can be revoked on its own and you can see which service is calling.
- The list shows each key's start (`ats_live_8f3k…`), status (Active / Revoked / Expired) and **when it was last used**.
- **Revoke** (⋮ → Revoke) stops a key at once; it can't be undone — create a new key to give access again.
  A lost or leaked key: revoke it and issue a new one.
- Creating and revoking keys are recorded in the **Audit Log**.

### For the other system's developer: call the API

Send the key in the `X-API-Key` header **from your server** (never from a web page or mobile app, where it could be
copied):

```bash
curl -H "X-API-Key: ats_live_…" \
  "https://asset.moa.gov.et/api/v1/assets-dashboard?from=2026-07-08&to=2026-10-20"
```

```js
// Node.js 18+ (keep the key in your server's environment, e.g. .env)
const res = await fetch('https://asset.moa.gov.et/api/v1/assets-dashboard?from=2026-07-08&to=2026-10-20', {
  headers: { 'X-API-Key': process.env.ATS_API_KEY },
});
const { data } = await res.json();
```

**Filters** (all optional; the same as the in-app dashboard):

| Parameter | Example | Meaning |
| :--- | :--- | :--- |
| `from`, `to` | `2026-07-08`, `2026-10-20` | Period, Gregorian `YYYY-MM-DD` (received / issued within it) |
| `storeId` | `STR-03` | One store only |
| `category` | `IT_EQUIPMENT` | One asset category only |
| `itemType` | `FIXED` or `CONSUMABLE` | Fixed assets or consumables only |

**Response** (`data`; amounts in ETB, `units` = quantities):

```json
{
  "generatedAt": "2026-10-20T17:59:02.670Z",
  "filter": { "from": "2026-07-08", "to": "2026-10-20", "storeId": null, "category": null, "itemType": null },
  "assets": {
    "total":       { "units": 1240, "valueETB": 48250000 },
    "inStore":     { "units": 310,  "valueETB": 9100000 },
    "issued":      { "units": 905,  "valueETB": 38400000 },
    "disposed":    { "units": 25,   "valueETB": 750000 },
    "fixedAssets": { "units": 640,  "valueETB": 45100000 },
    "consumables": { "units": 600,  "valueETB": 3150000 }
  },
  "pending": { "receipts": 4, "issues": 2, "transfers": 1, "disposals": 0, "total": 7, "valueETB": 912000,
               "withTeamLeader": 5, "withDepartmentHead": 2 },
  "movement":    [{ "month": "2026-09", "received": 85, "issued": 60 }],
  "byCategory":  [{ "category": "IT_EQUIPMENT", "units": 420, "valueETB": 21400000 }],
  "byStore":     [{ "store": "Head office · Central Store", "units": 900, "valueETB": 36100000,
                   "inStoreUnits": 210, "issuedUnits": 680, "pending": 3 }],
  "byCondition": [{ "condition": "NEW", "units": 1100, "valueETB": 44000000 }],
  "staleInStore": { "thresholdDays": 30, "items": 12, "units": 40, "valueETB": 640000 }
}
```

`assets` counts **approved** records (as the in-app dashboard does); receipts and requests still waiting for approval
are under `pending`.

**Errors:**

| Status | When |
| :--- | :--- |
| `401` | No key, or the key is wrong, revoked or expired |
| `403` | The key isn't allowed to read the key figures |
| `429` | More than **60 calls a minute** with this key — refreshing every few minutes is plenty |

Full reference: **API documentation → "Integration (API key)"** at `https://asset.moa.gov.et/api/docs`
(locally [http://localhost:3000/api/docs](http://localhost:3000/api/docs)).

## 🛡️ Core Business Invariants
1. **Asset Prefixing**: Asset Tag Codes follow statutory formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **2-Stage Approval Gate**: Asset status updates (`AVAILABLE` or `ISSUED`) only occur after Stage 2 Directorate Head final sign-off.
3. **Single Custodian Rule**: Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Model 22 Returns atomically clear custodian liability (`currentCustodianId = null`).
4. **Immutable History**: Audit logs and state transition records cannot be deleted.
5. **Dual Calendar Integrity**: All transactions record both G.C. and E.C. timestamps.

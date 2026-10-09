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

Open **http://localhost:3001** (the API is at http://localhost:3000/api, health check at `/api/health`). Sign in with a demo account from [Roles, Credentials & Access Matrix](#-roles-credentials--access-matrix), all with password `moaams2024`, for example `sysadmin@moa.gov.et` or `encoder@moa.gov.et`.

| Command (from the repository root) | What it does |
|---|---|
| `npm run dev:backend` / `npm run dev:frontend` | Start only the API or only the web app |
| `npm run db:push` | Apply schema changes to the database |
| `npm run db:seed` | Add the demo users and store items again |
| `npm run db:studio` | Browse the database at http://localhost:5555 |

### B. Docker (database, API and nginx)

**You need:** Docker with Compose. No Node or PostgreSQL install.

```bash
cp .env.example .env        # then set POSTGRES_PASSWORD and JWT_SECRET (see the comments inside)
npm run docker:local        # build and start; open http://localhost:8080
npm run docker:local:down   # stop (keeps the local database)
```

This runs over plain HTTP on port 8080 (`LOCAL_PORT` in `.env` changes it) using `docker-compose.local.yml` and `nginx/nginx.local.conf`. These two files exist only for local runs: staging and production use `docker-compose.yml` and `nginx/nginx.conf` with the certificate, and Jenkins ships only those. The database starts empty, so the first System Administrator comes from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. To get the demo accounts instead, use option A.

### Troubleshooting

| Problem | Fix |
|---|---|
| `npm run db:setup` can't connect | PostgreSQL isn't running, or `DATABASE_URL` in `backend/.env` has the wrong user, password or port. |
| Browser shows a certificate warning, or a redirect to `https://` | You opened a server address. Use `http://localhost:3001` (option A) or `http://localhost:8080` (option B). If the browser remembered HTTPS for localhost, open `chrome://net-internals/#hsts` and delete `localhost`. |
| Port 3000, 3001 or 8080 is in use | Stop what uses it; for option B set `LOCAL_PORT` in `.env`. |
| Signed out after every backend restart | Set `JWT_SECRET` in `backend/.env`. |

---

## 🧪 Testing with Vitest (Unit & Integration Tests)

The system utilizes **[Vitest](https://vitest.dev/)** as the unified, high-performance unit test runner for both the frontend and backend, structured in alignment with the **Livescan** test architecture standard.

### Test Suites Overview (114 Unit Tests + 87 Integration Assertions)

- **Backend Unit Tests (`backend/src/**/*.test.ts`)** — *36 Tests / 5 Suites (~400ms)*:
  - **Store Service Invariants** (`store-rules.test.ts`): Model 19 mandatory IFMIS slip validation, 2-stage sequential approval transitions (Stage 1 Team Leader endorsement, Stage 2 Dept Head sign-off), and atomic status transitions (`AVAILABLE`, `ISSUED`, `PENDING_DISPOSAL`, `DISPOSED`, `REJECTED`).
  - **Auth Middleware & SOD** (`auth.middleware.test.ts`): Strict Segregation of Duties guards blocking Data Encoders from approvals and System Admins from operational transactions.
  - **Authentication Service** (`auth.service.test.ts`): Singleton lifecycle, token decoding, and malformed token rejection.
  - **Ethiopian Date Engine** (`eth-date.test.ts`): Julian Day Number calculations, Pagume leap year rules, and GC ↔ EC conversions.

- **Frontend Unit Tests (`frontend/src/**/*.{test,spec}.{ts,tsx}`)** — *78 Tests / 9 Suites (~4s)*:
  - **Dual Calendar Engine** (`eth-date.test.ts`): Bidirectional Gregorian ↔ Ethiopian calendar transformations, Meskerem 1 New Year boundary, Pagume 5 vs 6 days, and ETB currency formatting.
  - **System Settings** (`system-settings.test.ts`): Attachment policy persistence (`localStorage`) and custom event broadcasting.
  - **Role-Based Access & SOD** (`role-guards.test.ts`): Role tab navigation, landing tab resolution, and privilege restrictions.
  - **Approvals & Queue Logic** (`approvals-workflow.test.ts`): Stage 1 vs Stage 2 queue filtering, batch selection safety, and multi-field search.
  - **Statutory Vouchers** (`CustodyVoucherModal.test.tsx`): Model 19 (GRN), Model 20 (Issue Voucher), and Model 22 (Return Voucher) dual-calendar certificate rendering.
  - **Toast Notifications** (`ToastContext.test.tsx` & `Toast.test.tsx`): Context hook, auto-dismiss countdown, and UI presentation.
  - **Status & Condition Badges** (`Badge.test.tsx`): Ethiopian MoA asset status and condition badge mappings.

- **Backend Integration Tests (`backend/test-*.js`)** — *87 Assertions*:
  - `test-critical-flows.js`: End-to-end 2-stage inbound stock-in, outbound stock-out, custody transfer, and SOD enforcement.
  - `test-status-consistency.js`: Atomic status lifecycle, stage sequencing, concurrency locks, and audit trail permanence.

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

| # | Role | Email Login | Title | Default View | Accessible Tabs | Access Scope & Responsibilities |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`DATA_ENCODER`** | `encoder@moa.gov.et` | Store Custodian / Encoder | Stock-In | `Stock-In`, `Stock-Out`, `Asset Transfer`, other `Settings` (excluding Users/Roles) | **Operational Ingestion & Requisition**: Registers Model 19 (GRN), submits Model 20 (Issue), initiates inter-store transfers & Model 22 Returns. *(Strict SOD: Forbidden from approving vouchers).* |
| 2 | **`TEAM_LEADER`** | `teamleader@moa.gov.et` | Team Leader | Approvals | `Approvals`, `Reports`, `Audit Log` | **Stage 1 Endorsement**: Verifies technical specs and endorses pending vouchers before forwarding to Stage 2. Full read access to operational reports and audit trail. |
| 3 | **`DEPARTMENT_HEAD`** | `depthead@moa.gov.et` | Directorate Head | Approvals | `Approvals`, `Reports`, `Audit Log`, other `Settings` (excluding Users/Roles) | **Stage 2 Final Authorization**: Final statutory sign-off that commits stock transitions (`AVAILABLE`, `ISSUED`). Full access to reports, audit trail, and department settings. |
| 4 | **`MANAGER`** | `manager@moa.gov.et` | Manager | Dashboard | `Dashboard`, `Reports` | **Executive Oversight**: Read-only executive view over total ministry portfolio valuation, directorate allocations, custodian ratios, and store capacities, plus read-only operational reports. Isolated from operations. |
| 5 | **`SYSTEM_ADMIN`** | `sysadmin@moa.gov.et` | System Administrator | Dashboard | `Dashboard`, `Reports`, `Audit Log`, `Settings` | **IT & Security Governance**: Manages user accounts, assigns the five fixed roles and configures system settings. *(Strict SOD: Blocked from store operations & approvals).* |
| 6 | **`EMPLOYEE`** | `almaz.a@moa.gov.et` | Employee | My assets | `My assets` | **Self-service, read-only**: sees only the assets issued to them (serial number, when and on which slip, pending transfer or return). Nothing about anyone else; none of the staff-wide pages. |

---

## Roles administration

The implemented **Settings → Roles** directory shows the six system roles, permissions, live member counts, and links to filtered user assignments. Users and Roles are restricted to System Administrators. See [Roles setup and behavior](docs/ROLES.md) for the database upgrade and session changes.

## 🛡️ Core Business Invariants
1. **Asset Prefixing**: Asset Tag Codes follow statutory formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **2-Stage Approval Gate**: Asset status updates (`AVAILABLE` or `ISSUED`) only occur after Stage 2 Directorate Head final sign-off.
3. **Single Custodian Rule**: Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Model 22 Returns atomically clear custodian liability (`currentCustodianId = null`).
4. **Immutable History**: Audit logs and state transition records cannot be deleted.
5. **Dual Calendar Integrity**: All transactions record both G.C. and E.C. timestamps.

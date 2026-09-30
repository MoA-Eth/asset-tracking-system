# Federal Democratic Republic of Ethiopia – Ministry of Agriculture (MoA)
## Asset Tracking System (MoA-AMS) — IFMIS Mirror Platform

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

---

## 🚀 Setup & Running Instructions

See [Page implementation inventory](docs/PAGE_STATUS.md) for built pages and remaining page gaps. The Departments page is available under **Settings → Departments** (or **Departments** on mobile) and shows directorate staff and live asset allocations.

### Prerequisites
- **Node.js**: `v20.x` or higher
- **PostgreSQL**: `v15.x` or higher
- **npm**: `v10.x` or higher

---

### Step 1: Clone Repository
```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git
cd asset-tracking-system
```

### Step 2: Configure Environment Variables
For an isolated local development setup with PostgreSQL already installed, install dependencies with `npm run install:all`, then run:
```bash
npm run setup:local
npm run build
npm start
```
This creates a project-owned database in ignored `.local/` on loopback port **5433**, generates `backend/.env` with a random database password, applies the schema, and seeds the demo accounts. It leaves any existing PostgreSQL installation's databases and credentials intact. `npm start` and `npm run dev` restart this local database when needed. `npm run db:local:stop` stops it. If the PostgreSQL tools are not on your PATH, set `POSTGRES_BIN` to their `bin` directory.

The built app and API share **http://localhost:3000**. Use `npm run dev` instead when editing; the development frontend is on port **3001**. Prisma client generation runs automatically before backend development, builds, and tests. Once built, starting the app requires no dependency downloads.

For an existing or hosted database, follow the manual configuration below. Set `DATABASE_URL` to its real connection string; the template password is only an example. The local setup command refuses to seed a different configured database.

Copy `.env.example` templates to `.env` in both `backend/` and `frontend/`:
```bash
# Backend environment setup
cp backend/.env.example backend/.env

# Frontend environment setup
cp frontend/.env.example frontend/.env
```

### Step 3: Install Workspace Dependencies
*(Must be executed from the root directory `asset-tracking-system/`)*
```bash
npm run install:all
```

### Step 4: Database Setup (Prisma & Seed Data)
Ensure PostgreSQL is running locally, then execute from the root directory (`asset-tracking-system/`):
```bash
npm run db:setup
```
*Note: If the `moa_ams` database does not exist yet in PostgreSQL, Prisma automatically creates it, applies all tables/relations, and seeds demo data.*

*Useful Database Helper Scripts (Run from `asset-tracking-system/`):*
- `npm run db:push` — Push schema updates to database
- `npm run db:seed` — Seed demo users and initial store assets
- `npm run db:studio` — Open interactive Prisma Studio DB browser GUI (`http://localhost:5555`)

### Step 5: Start Development Services (Recommended)
From the root directory (`asset-tracking-system/`), run both backend Express API and frontend Vite React app concurrently:
```bash
npm run dev
```
* **Frontend Web App**: `http://localhost:3001`
* **Backend Express API**: `http://localhost:3000/api`

### Step 6: Run Services Independently
* **Backend Service (`backend/`)**:
  ```bash
  npm run dev:backend
  ```
* **Frontend Web App (`frontend/`)**:
  ```bash
  npm run dev:frontend
  ```

### Access over organization Wi-Fi

Keep the app running on the host computer. From another device on the same network, open the **Network** URL printed by the server, for example `http://<host-wifi-ip>:3000` for `npm start`, or `http://<host-wifi-ip>:3001` for development. `localhost` always refers to the device opening the page, so it cannot be used to reach another computer. The host IP may change when switching Wi-Fi networks.

The backend binds to `0.0.0.0` by default (configurable with `HOST`), and Vite binds to all IPv4 interfaces with a fixed port. All browser API requests use `/api` on the page's own origin; other devices do not need direct database access or a separate backend URL. The page uses installed system fonts and has no Google Fonts network dependency. The health endpoint, `http://<host-wifi-ip>:3000/api/health`, returns **503** when the database is unavailable.

If the Network URL works on the host but cannot load on another Wi-Fi device, ask organization IT to confirm that the devices can reach each other and permit inbound TCP to the app port on the host. Some organization or guest Wi-Fi networks isolate devices or restrict ports. For organization-wide hosting, IT can put the single-server app behind an approved HTTPS reverse proxy on port 443, routing both the page and `/api` to the same backend. Development demo accounts should be used only for testing.

---

## 🧪 Testing with Vitest (Unit & Integration Tests)

The system utilizes **[Vitest](https://vitest.dev/)** as the unified, high-performance unit test runner for both the frontend and backend, structured in alignment with the **Livescan** test architecture standard.

### Test Suites Overview (247 Unit/API Tests + 121 Integration Assertions)

- **Backend Unit/API Tests (`backend/src/**/*.test.ts`)** — *111 Tests / 9 Suites*:
  - **Location Management** (`location.service.test.ts`, `access-control.test.ts`): Administrator-only writes, field validation, duplicate checks, linked-asset deletion protection, concurrency conflicts, and transactional audits.
  - **Approved API Access** (`access-control.test.ts`, `store-authorization.test.ts`): HTTP permissions for all five roles, session requirements, encoder submission scope, actual store approval-stage guards, and transactional role/audit writes.
  - **App Availability** (`app.test.ts`): Database-aware health checks, resolved persona responses, and JSON API errors.
  - **Store Service Invariants** (`store-rules.test.ts`): Model 19 mandatory IFMIS slip validation, 2-stage sequential approval transitions (Stage 1 Team Leader endorsement, Stage 2 Dept Head sign-off), and atomic status transitions (`AVAILABLE`, `ISSUED`, `DISPOSED`).
  - **Auth Middleware & SOD** (`auth.middleware.test.ts`): Strict Segregation of Duties guards blocking Data Encoders from approvals and System Admins from operational transactions.
  - **Authentication Service** (`auth.service.test.ts`): Singleton lifecycle, token decoding, and malformed token rejection.
  - **Ethiopian Date Engine** (`eth-date.test.ts`): Julian Day Number calculations, Pagume leap year rules, and GC ↔ EC conversions.

- **Frontend Unit Tests (`frontend/src/**/*.{test,spec}.{ts,tsx}`)** — *136 Tests / 15 Suites*:
  - **Stores** (`StoresPage.test.tsx`): Existing store designation and detail management, correct available-stock totals, pending movements, inventory search/status filtering, role restrictions, preservation of location/asset records, and desktop/mobile routing.
  - **Locations** (`LocationsPage.test.tsx`): Live totals/details, search/filter/sort, administrator editing, delete confirmation/protection, read-only roles, retries, and real desktop/mobile routing.
  - **Approved Navigation & Settings Access** (`navigation.test.tsx`, `SettingsPage.test.tsx`): Desktop/mobile parity, access to all permitted links, hidden unbuilt pages, read-only employee views, and administrator role controls.
  - **Departments** (`DepartmentsPage.test.tsx`): Live allocation totals, bilingual search, staff and asset details, retry states, and desktop/mobile navigation.
  - **API Connectivity** (`client.test.ts`): Same-origin login, connection failures, request timeouts, and gateway responses.
  - **Dual Calendar Engine** (`eth-date.test.ts`): Bidirectional Gregorian ↔ Ethiopian calendar transformations, Meskerem 1 New Year boundary, Pagume 5 vs 6 days, and ETB currency formatting.
  - **System Settings** (`system-settings.test.ts`): Attachment policy persistence (`localStorage`) and custom event broadcasting.
  - **Role-Based Access & SOD** (`role-guards.test.ts`): Role tab navigation, landing tab resolution, and privilege restrictions.
  - **Approvals & Queue Logic** (`approvals-workflow.test.ts`): Stage 1 vs Stage 2 queue filtering, batch selection safety, and multi-field search.
  - **Statutory Vouchers** (`CustodyVoucherModal.test.tsx`): Model 19 (GRN), Model 20 (Issue Voucher), and Model 22 (Return Voucher) dual-calendar certificate rendering.
  - **Toast Notifications** (`ToastContext.test.tsx` & `Toast.test.tsx`): Context hook, auto-dismiss countdown, and UI presentation.
  - **Status & Condition Badges** (`Badge.test.tsx`): Ethiopian MoA asset status and condition badge mappings.

- **Backend Integration Tests (`backend/test-*.js`)** — *121 Assertions*:
  - `test-critical-flows.js`: End-to-end 2-stage inbound stock-in, outbound stock-out, custody transfer, and SOD enforcement.
  - `test-status-consistency.js`: Atomic status lifecycle, stage sequencing, concurrency locks, and audit trail permanence.
  - `test-locations.js`: Live location create/edit/delete, role restrictions, case-insensitive and concurrent duplicate protection, linked-asset deletion guard, and retained audit history. Creates temporary location records and removes unused test records afterward.

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
To verify the API through a Wi-Fi address, set `AMS_API_BASE_URL` to `http://<host-wifi-ip>:3000/api` when running this command. Integration tests create test assets and audit records; run them against a development database.

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

> **5 statutory roles** implement strict Segregation of Duties (SOD) — operational entry, technical endorsement, statutory authorization, and platform governance are strictly decoupled.

The user-approved [page and role access map](docs/ROLE_ACCESS.md) is the detailed navigation policy. The table below lists currently available destinations; [page status](docs/PAGE_STATUS.md) distinguishes existing controls from planned management pages. After updating an existing installation, run `npm run db:push` to apply the audit-subject schema fix without resetting data.

| # | Role | Email Login | Title | Default View | Accessible Tabs | Access Scope & Responsibilities |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`DATA_ENCODER`** | `encoder@moa.gov.et` | Store Custodian / Encoder | Stock-In | `Stock-In`, `Stock-Out`, `Asset Transfer`, `Employees`, `Departments`, `Locations`, `Stores` | Registers Model 19, submits Model 20, initiates transfers and Model 22 returns. Reference data is read-only; no approval or account-management actions. |
| 2 | **`TEAM_LEADER`** | `teamleader@moa.gov.et` | Team Leader | Approvals | `Approvals`, `Reports`, `Audit Log` | **Stage 1 Endorsement**: Verifies technical specs and endorses pending vouchers before forwarding to Stage 2. Full read access to operational reports and audit trail. |
| 3 | **`DEPARTMENT_HEAD`** | `depthead@moa.gov.et` | Directorate Head | Approvals | `Dashboard`, `Approvals`, `Reports`, `Audit Log`, `Employees`, `Departments`, `Locations`, `Stores` | Stage 2 final approval/rejection, oversight, and read-only reference data. Department-scoped settings are planned; account and global policy controls are administrator-only. |
| 4 | **`MANAGER`** | `manager@moa.gov.et` | Manager | Dashboard | `Dashboard`, `Reports`, `Audit Log`, `Departments` | Read-only executive oversight, reports/exports, audit visibility, and department allocations. No operations or approval actions. |
| 5 | **`SYSTEM_ADMIN`** | `sysadmin@moa.gov.et` | System Administrator | Dashboard | `Dashboard`, `Reports`, `Audit Log`, `Employees`, `Departments`, `Locations`, `Stores`, `User Accounts`, `System Settings` | Location/store designation management, staff role management, and browser-local policy controls. Remaining registry/account management and the approval-matrix page remain planned. Blocked from stock operations and approval actions. |

---

## 🛡️ Core Business Invariants
1. **Asset Prefixing**: Asset Tag Codes follow statutory formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **2-Stage Approval Gate**: Asset status updates (`AVAILABLE` or `ISSUED`) only occur after Stage 2 Directorate Head final sign-off.
3. **Single Custodian Rule**: Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Model 22 Returns atomically clear custodian liability (`currentCustodianId = null`).
4. **Immutable History**: Audit logs and state transition records cannot be deleted.
5. **Dual Calendar Integrity**: All transactions record both G.C. and E.C. timestamps.

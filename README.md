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

**Deploying:** install a server step by step with [docs/ON-PREMISE-SETUP.md](docs/ON-PREMISE-SETUP.md); releases then go out through Jenkins as in [docs/CI-CD.md](docs/CI-CD.md). Background and options: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 🚀 Setup & Running Instructions

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

---

## 🧪 Testing with Vitest (Unit & Integration Tests)

The system utilizes **[Vitest](https://vitest.dev/)** as the unified, high-performance unit test runner for both the frontend and backend, structured in alignment with the **Livescan** test architecture standard.

### Test Suites Overview (114 Unit Tests + 87 Integration Assertions)

- **Backend Unit Tests (`backend/src/**/*.test.ts`)** — *36 Tests / 5 Suites (~400ms)*:
  - **Store Service Invariants** (`store-rules.test.ts`): Model 19 mandatory IFMIS slip validation, 2-stage sequential approval transitions (Stage 1 Team Leader endorsement, Stage 2 Dept Head sign-off), and atomic status transitions (`AVAILABLE`, `ISSUED`, `DISPOSED`).
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

> **5 statutory roles** implement strict Segregation of Duties (SOD) — operational entry, technical endorsement, statutory authorization, and platform governance are strictly decoupled.

| # | Role | Email Login | Title | Default View | Accessible Tabs | Access Scope & Responsibilities |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`DATA_ENCODER`** | `encoder@moa.gov.et` | Store Custodian / Encoder | Stock-In | `Stock-In`, `Stock-Out`, `Asset Transfer`, other `Settings` (excluding Users/Roles) | **Operational Ingestion & Requisition**: Registers Model 19 (GRN), submits Model 20 (Issue), initiates inter-store transfers & Model 22 Returns. *(Strict SOD: Forbidden from approving vouchers).* |
| 2 | **`TEAM_LEADER`** | `teamleader@moa.gov.et` | Team Leader | Approvals | `Approvals`, `Reports`, `Audit Log` | **Stage 1 Endorsement**: Verifies technical specs and endorses pending vouchers before forwarding to Stage 2. Full read access to operational reports and audit trail. |
| 3 | **`DEPARTMENT_HEAD`** | `depthead@moa.gov.et` | Directorate Head | Approvals | `Approvals`, `Reports`, `Audit Log`, other `Settings` (excluding Users/Roles) | **Stage 2 Final Authorization**: Final statutory sign-off that commits stock transitions (`AVAILABLE`, `ISSUED`). Full access to reports, audit trail, and department settings. |
| 4 | **`MANAGER`** | `manager@moa.gov.et` | Manager | Dashboard | `Dashboard`, `Reports` | **Executive Oversight**: Read-only executive view over total ministry portfolio valuation, directorate allocations, custodian ratios, and store capacities, plus read-only operational reports. Isolated from operations. |
| 5 | **`SYSTEM_ADMIN`** | `sysadmin@moa.gov.et` | System Administrator | Dashboard | `Dashboard`, `Reports`, `Audit Log`, `Settings` | **IT & Security Governance**: Manages user accounts, assigns the five fixed roles and configures system settings. *(Strict SOD: Blocked from store operations & approvals).* |

---

## Roles administration

The implemented **Settings → Roles** directory shows the five system roles, permissions, live member counts, and links to filtered user assignments. Users and Roles are restricted to System Administrators. See [Roles setup and behavior](docs/ROLES.md) for the database upgrade and session changes.

## 🛡️ Core Business Invariants
1. **Asset Prefixing**: Asset Tag Codes follow statutory formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **2-Stage Approval Gate**: Asset status updates (`AVAILABLE` or `ISSUED`) only occur after Stage 2 Directorate Head final sign-off.
3. **Single Custodian Rule**: Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Model 22 Returns atomically clear custodian liability (`currentCustodianId = null`).
4. **Immutable History**: Audit logs and state transition records cannot be deleted.
5. **Dual Calendar Integrity**: All transactions record both G.C. and E.C. timestamps.

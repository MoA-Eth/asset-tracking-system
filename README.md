# Federal Democratic Republic of Ethiopia – Ministry of Agriculture (MoA)
## Asset Tracking System (MoA-AMS) — IFMIS Mirror Platform

A modern, enterprise-grade asset tracking system and REST API built to mirror the Ethiopian Government's **Integrated Financial Management Information System (IFMIS)**. Implements statutory Ethiopian property management vouchers (**Model 19**, **Model 20**, **Model 22**), dual Gregorian/Ethiopian calendar synchronization, and role-based access control.

---

## 🏛️ Core Capabilities

- **Statutory Voucher Workflows**:
  - **Model 19 (የዕቃ መረከቢያ):** Inbound Store Goods Receipt Voucher.
  - **Model 20 (የዕቃ ወጪ ማዘዣ):** Store Issue Voucher assigning items to custodians.
  - **Model 22 (የዕቃ መመለሻ):** Asset Return Voucher clearing custodian liability.
- **Dual Calendar Engine**: Bidirectional lockstep synchronization across **Gregorian Calendar (G.C.)** and **Ethiopian Calendar (E.C.)**.
- **2-Stage Sequential Approval Workflow**:
  - **Stage 1 (Team Leader Endorsement)**: Review and endorse store requests.
  - **Stage 2 (Directorate Head Authorization)**: Final sign-off and property status update (`AVAILABLE` or `ISSUED`).
- **Role Governance**: Privilege separation across System Admin (`SYSTEM_ADMIN`), Team Leaders (`TEAM_LEADER`), Directorate Heads (`DEPARTMENT_HEAD`), Store Custodians (`DATA_ENCODER`), and Executive Leadership (`TOP_MANAGEMENT`).

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

## 🔑 Test Roles & Credentials

All test accounts use uniform password **`moaams2024`**:

| Role | Email Login | Access Scope | Approval Stage Responsibility | Accessible Tabs |
| :--- | :--- | :--- | :--- | :--- |
| **`DATA_ENCODER`** | `encoder@moa.gov.et`<br>`storekeeper@moa.gov.et` | Store Custodian | Requisitioner (Model 19, 20, 22) | Stock-In, Stock-Out, Transfer Asset, Settings |
| **`TEAM_LEADER`** | `teamlead@moa.gov.et`<br>`mulugeta.b@moa.gov.et` | Team Leader | **Stage 1 Endorsement** | Approvals (Stage 1), Reports, Audit Log |
| **`DEPARTMENT_HEAD`** | `head@moa.gov.et`<br>`abebe.k@moa.gov.et` | Directorate Head | **Stage 2 Final Authorization** | Approvals (Stage 2), Reports, Settings, Audit Log |
| **`TOP_MANAGEMENT`** | `minister@moa.gov.et` | Executive Minister | Executive Visibility | Executive Dashboard (Portfolio Valuation, Directorate Allocations, Custody Ratios, Stores) |
| **`SYSTEM_ADMIN`** | `admin@moa.gov.et` | System Administrator | IT Governance & Security (SOD) | System Dashboard, User Management, Approval Matrix, System Config, Reports, Audit Logs (Store Operations & Approvals hidden for Segregation of Duties) |

---

## 🛡️ Core Business Invariants
1. **Asset Prefixing**: Asset Tag Codes follow statutory formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **2-Stage Approval Gate**: Asset status updates (`AVAILABLE` or `ISSUED`) only occur after Stage 2 Directorate Head final sign-off.
3. **Single Custodian Rule**: Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Model 22 Returns atomically clear custodian liability (`currentCustodianId = null`).
4. **Immutable History**: Audit logs and state transition records cannot be deleted.
5. **Dual Calendar Integrity**: All transactions record both G.C. and E.C. timestamps.

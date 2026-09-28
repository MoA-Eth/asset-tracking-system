# Federal Democratic Republic of Ethiopia – Ministry of Agriculture
## Asset Tracking System (MoA-AMS) — IFMIS Mirror Platform

A modern, enterprise-grade asset tracking system and REST API built to mirror the Ethiopian Government's **Integrated Financial Management Information System (IFMIS)**. Implements statutory Ethiopian property management vouchers (**Model 19**, **Model 20**, **Model 22**), dual Gregorian/Ethiopian calendar synchronization, and role-based access control.

---

## 🏛️ Core Capabilities

- **Statutory Voucher Workflows**:
  - **Model 19 (የዕቃ መረከቢያ):** Inbound Store Goods Receipt Voucher.
  - **Model 20 (የዕቃ ወጪ ማዘዣ):** Store Issue Voucher assigning items to custodians.
  - **Model 22 (የዕቃ መመለሻ):** Asset Return Voucher clearing custodian liability.
- **Dual Calendar Engine**: Bidirectional lockstep synchronization across **Gregorian Calendar (G.C.)** and **Ethiopian Calendar (E.C.)**.
- **Role Governance**: Privilege separation for Store Custodians (`DATA_ENCODER`), Directorate Heads (`DEPARTMENT_HEAD`), and Executive Leadership (`TOP_MANAGEMENT`).

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
└── package.json              # Monorepo workspace runner
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

### Step 3: Database Migration & Client Setup
```bash
cd backend
npx prisma generate
npx prisma db push
cd ..
```

### Step 4: Install Dependencies & Run System
From the root repository folder:
```bash
# Install all workspace dependencies
npm run install:all

# Start Backend API & Frontend UI concurrently
npm run dev
```

* **Frontend Web App**: `http://localhost:5173`
* **Backend Express API**: `http://localhost:3000/api`

---

## 🔑 Test Roles & Privileges

| Role | Access Scope | Accessible Tabs |
| :--- | :--- | :--- |
| **`TOP_MANAGEMENT`** | Executive Minister | Dashboard, Reports, Audit Log |
| **`DEPARTMENT_HEAD`** | Directorate Head | Dashboard, Approvals Queue, Receive/Request Items, Movement, Reports, Settings, Audit Log |
| **`DATA_ENCODER`** | Store Custodian | Receive Items, Request Items, Asset Movement, Settings, Audit Log |

---

## 🛡️ Core Business Invariants
1. **Asset Prefixing**: Asset Tag Codes follow statutory formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **Single Custodian Rule**: Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Model 22 Returns atomically clear custodian liability (`currentCustodianId = null`).
3. **Immutable History**: Audit logs and state transition records cannot be deleted.


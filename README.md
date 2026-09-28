# Federal Democratic Republic of Ethiopia – Ministry of Agriculture (MoA)
## Asset Management System (MoA-AMS) — Monorepo Architecture

A modern, enterprise-grade Asset Management System and REST API conforming to statutory Ethiopian property administration guidelines (**Model 19**, **Model 20**, and **Model 22**), Integrated Financial Management Information System (**IFMIS**) operational standards, and dual Gregorian/Ethiopian calendar synchronization.

---

## 🏛️ System Overview & Key Capabilities

- **IFMIS Operational Mirror**: Co-exists alongside IFMIS to provide line-by-line store tracking, custodian accountability, and executive dashboards.
- **Statutory Ethiopian Government Vouchers**:
  - **Model 19 (የዕቃ መረከቢያ):** Inbound Store Goods Receipt Voucher.
  - **Model 20 (የዕቃ ወጪ ማዘዣ እና መረከቢያ):** Store Issue Voucher assigning items to custodians.
  - **Model 22 (የዕቃ መመለሻ መረከቢያ):** Store Asset Return Voucher clearing custodian liability.
- **Dual Calendar Synchronization:** Automatic lockstep sync between **Gregorian Calendar (G.C.)** and **Ethiopian Calendar (E.C.)**.
- **Role-Based Access Control (RBAC):** Strict privilege separation across Store Custodians (`DATA_ENCODER`), Directorate Heads (`DEPARTMENT_HEAD`), and Executive Leadership (`TOP_MANAGEMENT`).

---

## 📁 Repository Structure (`@MoA-Eth` Standard)

This repository is organized as a consolidated monorepo under `@MoA-Eth`:

```text
asset-management-system/
├── backend/                  # Express.js REST API + Prisma ORM + PostgreSQL
│   ├── prisma/               # Database schema definitions & migrations
│   ├── src/                  # Controllers, routes, middleware, RBAC & calendar engine
│   ├── .env.example          # Backend environment configuration template
│   └── package.json          # Backend dependencies and scripts
│
├── frontend/                 # React 18 (TypeScript) + Vite + Tailwind CSS
│   ├── src/                  # Components, pages, dual calendar & print voucher forms
│   ├── public/               # Ministry emblem and PWA static assets
│   ├── .env.example          # Frontend environment configuration template
│   └── package.json          # Frontend dependencies and scripts
│
├── docs/                     # Technical specifications and architecture documentation
├── technical_documentation.md # Detailed system architecture & database data dictionary
├── package.json              # Root monorepo workspace runner
└── README.md                 # Root repository overview (this file)
```

---

## 🚀 Development & Setup Commands

### 1. Install Workspace Dependencies
From the root repository directory:
```bash
npm run install:all
```

### 2. Start Both Backend & Frontend Concurrently (Recommended)
```bash
npm run dev
```
- **Backend Express API:** `http://localhost:3000/api`
- **Frontend React UI:** `http://localhost:5173`

### 3. Run Services Independently
* **Backend Service (`backend/`)**:
  ```bash
  npm run dev:backend
  ```
* **Frontend Web App (`frontend/`)**:
  ```bash
  npm run dev:frontend
  ```

---

## 🛡️ Core Business Invariants Enforced

1. **Unique Asset Tagging:** Asset codes follow statutory MoA prefix formatting (`MOA-VEH-001`, `MOA-IT-042`).
2. **Single Custodian Rule:** Active custodian (`currentCustodianId`) is set when status is `ISSUED`. Returns atomically clear custodian liability (`currentCustodianId = null`).
3. **No Hard Deletes:** Audit logs and transaction histories remain immutable.
4. **Dual Calendar Integrity:** All transactions record both G.C. and E.C. timestamps.

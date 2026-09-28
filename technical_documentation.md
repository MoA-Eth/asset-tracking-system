# Federal Democratic Republic of Ethiopia
## Ministry of Agriculture (MoA)

# Technical Documentation & Database Architecture Specification
### Asset Management System (MoA-AMS) — IFMIS Operational Mirror & Executive Visibility Platform

---

**Document Metadata**
- **Document Title**: MoA-AMS System Architecture & Database Design Specification
- **Organization**: Ministry of Agriculture, Ethiopia (FDRE)
- **Version**: 1.0.0 (Production Candidate)
- **Classification**: Internal Technical / Operational Specification
- **Date**: September 27, 2026
- **Status**: Final Approved

---

## 1. Executive Summary & System Scope

The **Ministry of Agriculture Asset Management System (MoA-AMS)** is an enterprise asset management and logistics tracking platform tailored for public sector governance in Ethiopia. 

### Key Capabilities:
1. **IFMIS Operational Mirror**: Co-exists alongside the Ministry's Integrated Financial Management Information System (**IFMIS**), providing item-level store tracking and custodian accountability.
2. **Double-Processing Slip Compliance**: Fully implements Ethiopian public procurement standards:
   * **Model 19 (የዕቃ መረከቢያ)**: Inbound Store Receipt Voucher.
   * **Model 20 (የዕቃ ወጪ ማዘዣ እና መረከቢያ)**: Outbound Store Issue Voucher.
   * **Model 22 (የዕቃ መመለሻ መረከቢያ)**: Asset Return Voucher.
3. **Dual Calendar Engine**: Operates in lockstep synchronization across both **Gregorian Calendar (G.C.)** and **Ethiopian Calendar (E.C.)**.
4. **Role-Based Governance**: Enforces strict privilege segregation across Store Custodians (`DATA_ENCODER`), Directorate Heads (`DEPARTMENT_HEAD`), and Executive Leadership (`TOP_MANAGEMENT`).

---

## 2. Technology Stack

| Layer | Technology | Version | Description & Role |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React** | 18.x | Component-based user interface library |
| **Frontend Language** | **TypeScript** | 5.x | Strictly typed client-side application code |
| **Build Tooling** | **Vite** | 5.x | High-performance client bundling & dev server |
| **Styling & UI Theme** | **TailwindCSS** | 3.x | Custom FDRE MoA Deep Emerald theme (`#071911` / `#FCDD09`) |
| **Icon Library** | **Lucide React** | 0.x | Scalable UI vectors and icons |
| **Backend Runtime** | **Node.js** | 20.x LTS | Server-side JavaScript runtime |
| **Backend Framework** | **Express.js** | 4.x | RESTful API routing and controller layer |
| **Database Engine** | **PostgreSQL** | 15.x / 16.x | Relational Database Management System (`moa_ams` DB) |
| **Database ORM** | **Prisma ORM** | 6.19.3 | Type-safe database client and migration tool |
| **Calendar Library** | **ethiopian-date** | 2.x | Bidirectional Gregorian ↔ Ethiopian calendar converter |

---

## 3. System Architecture & Data Flow

### Architectural Topology

```
+-------------------------------------------------------------------------+
|                         CLIENT LAYER (Browser)                          |
|  React 18 + TypeScript + Vite | TailwindCSS MoA Deep Emerald Theme     |
+-------------------------------------------------------------------------+
                                     |
                                     |  HTTP REST API (JSON Payload)
                                     v
+-------------------------------------------------------------------------+
|                         SERVER LAYER (Express.js)                        |
|  Node.js API Server | RBAC Authorization Middleware | Calendar Engine   |
+-------------------------------------------------------------------------+
                                     |
                                     |  Prisma Client (Type-Safe Queries)
                                     v
+-------------------------------------------------------------------------+
|                       DATABASE LAYER (PostgreSQL)                       |
|  PostgreSQL Instance (moa_ams) | 7 Relational Tables | Immutable Audit   |
+-------------------------------------------------------------------------+
```

---

## 4. Database Design & Schema Summary

### 4.1 Database Engine & Configuration
- **Database Engine**: PostgreSQL (`moa_ams` database)
- **ORM**: Prisma ORM v6.19.3 (`schema.prisma`)
- **Key Strategy**: Primary Keys use UUID v4 (`@default(uuid())`) for transactions and items; Business Keys for employees (`payrollId`) and departments (`code`).

---

### 4.2 Database Enums

| Enum Name | Enum Values | Business Scope |
| :--- | :--- | :--- |
| **`UserRole`** | `DATA_ENCODER`, `DEPARTMENT_HEAD`, `TOP_MANAGEMENT` | User authorization privileges |
| **`ItemStatus`** | `PENDING_STOCK_IN`, `AVAILABLE`, `PENDING_STOCK_OUT`, `ISSUED`, `IN_REPAIR`, `UNDER_TRANSFER`, `DISPOSED` | Asset lifecycle state machine |
| **`AssetCategory`** | `VEHICLE`, `AGRI_MACHINERY`, `IT_EQUIPMENT`, `OFFICE_FURNITURE`, `LAB_EQUIPMENT`, `FIELD_GEAR` | Store inventory classification |
| **`TransactionType`**| `STOCK_IN`, `STOCK_OUT`, `TRANSFER`, `RETURN` | IFMIS voucher events |
| **`ItemCondition`** | `NEW`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `DAMAGED` | Physical assessment rating |
| **`ApprovalStatus`** | `PENDING`, `APPROVED`, `REJECTED` | Directorate approval queue |

---

### 4.3 Concise Database Schema Matrix

| Model / Table | Key Fields | Foreign Keys / Relations | Purpose & Notes |
| :--- | :--- | :--- | :--- |
| **`Department`**<br>`departments` | `id`, `code`, `nameEn`, `nameAm`, `headEmployeeId` | Head Employee (`headEmployeeId`) | Ministry directorates and operational divisions |
| **`Location`**<br>`locations` | `id`, `siteName`, `building`, `roomNumber`, `isCentralStore` | Items (`items[]`) | Physical store depots and warehouse bays |
| **`Employee`**<br>`employees` | `id`, `payrollId`, `fullNameEn`, `fullNameAm`, `role`, `email`, `phone` | Department (`departmentId`) | Ministry staff, store custodians, and system users |
| **`Item`**<br>`items` | `id`, `itemCode`, `name`, `category`, `serialNumber`, `unitCostETB`, `status`, `condition`, `ifmisSlipNumber`, `ifmisSlipDateGc`, `ifmisSlipDateEc`, `createdAtGc`, `createdAtEc` | Store (`storeLocationId`), Custodian (`currentCustodianId`), Department (`assignedDepartmentId`), RegisteredBy (`registeredById`) | Primary asset ledger tracking valuation, physical condition, active custodian, IFMIS voucher reference, and dual dates |
| **`ItemHistory`**<br>`item_history` | `id`, `itemId`, `dateGc`, `dateEc`, `action`, `fromEntity`, `toEntity`, `performedBy`, `ifmisSlipNumber` | Item (`itemId` CASCADE) | Line-by-line audit trail of asset state transitions |
| **`TransactionApproval`**<br>`transaction_approvals` | `id`, `transactionType`, `itemId`, `itemCode`, `ifmisSlipNumber`, `status`, `requestedById`, `recipientEmployeeId`, `reviewedById`, `reviewRemarks` | Item (`itemId`), RequestedBy (`requestedById`), Recipient (`recipientEmployeeId`), ReviewedBy (`reviewedById`) | Approval queue for Model 20 Stock Out and Model 22 Returns |
| **`AuditLog`**<br>`audit_logs` | `id`, `timestampGc`, `timestampEc`, `userId`, `userName`, `userRole`, `action`, `entityType`, `entityId`, `previousState`, `newState` | User (`userId`), Item (`entityId`) | System governance ledger storing `previousState` and `newState` as native JSON snapshots |

---

## 5. Role-Based Access Control (RBAC) Matrix

| Navigation Menu & Feature | **`TOP_MANAGEMENT`** *(Executive Minister)* | **`DEPARTMENT_HEAD`** *(Directorate Head)* | **`DATA_ENCODER`** *(Store Custodian)* |
| :--- | :---: | :---: | :---: |
| **🏠 Dashboard** *(KPI Cards, Category Ring, Stock Bar Chart)* | ✅ Full Access | ✅ Full Access | ❌ Restricted |
| **📦 Inventory — Stock In** *(Model 19 Form & Table)* | ❌ Restricted | ✅ View & Approve | ✅ Create & Edit |
| **📦 Inventory — Stock Out** *(Model 20 Issue Form)* | ❌ Restricted | ✅ View & Approve | ✅ Create Request |
| **🔄 Asset Movement — Transfers** *(Relocation)* | ❌ Restricted | ✅ View & Approve | ✅ Create Request |
| **🔄 Asset Movement — Returns** *(Model 22 Return)* | ❌ Restricted | ✅ View & Approve | ✅ Create Request |
| **📊 Reports** *(Analytics, Audit Summaries, Exports)* | ✅ Full Access | ✅ Full Access | ❌ Restricted |
| **⚙ Settings** *(Users, Roles, Employees, Depots)* | ❌ Restricted | ✅ Full Access | ✅ Read Only |
| **📜 Audit Log** *(System Operations Ledger)* | ✅ Full Access | ✅ Full Access | ✅ Full Access |

---

## 6. IFMIS Voucher Integration Rules

1. **Model 19 (Inbound Store Receipt)**:
   * **Trigger**: Inbound shipment received at central store.
   * **Database Operation**: Inserts new record into `items` table with `status = AVAILABLE`.
   * **Validation**: Mandates `ifmisSlipNumber`, `ifmisSlipDateGc`, and `ifmisSlipDateEc`.

2. **Model 20 (Outbound Store Issue)**:
   * **Trigger**: Asset issued to employee or department.
   * **Database Operation**: Updates `items.status = ISSUED`, assigns `currentCustodianId = employee.id`. Creates `transaction_approvals` entry.

3. **Model 22 (Asset Return)**:
   * **Trigger**: Asset returned by custodian.
   * **Database Operation**: Updates `items.status = AVAILABLE` or `IN_REPAIR`, sets `currentCustodianId = NULL`.

---

## 7. REST API Endpoint Reference

| HTTP Method | Endpoint Path | Required Role | Functionality |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Server status and database connectivity check |
| `POST` | `/api/auth/login` | Public | Authenticates credentials and returns user payload |
| `GET` | `/api/dashboard` | Top Management, Dept Head | Aggregated KPI stats and asset distribution data |
| `GET` | `/api/items` | Data Encoder, Dept Head | Fetches list of registered assets with search/filters |
| `POST` | `/api/items` | Data Encoder | Registers new asset via Model 19 voucher |
| `POST` | `/api/items/stock-out` | Data Encoder | Registers Model 20 store issue request |
| `POST` | `/api/items/return` | Data Encoder | Registers Model 22 return request |
| `GET` | `/api/approvals` | Dept Head | Retrieves pending approval queue |
| `POST` | `/api/approvals/:id/approve` | Dept Head | Approves transaction and updates asset state |
| `POST` | `/api/approvals/:id/reject` | Dept Head | Rejects transaction with review remarks |
| `GET` | `/api/audit-logs` | All Authenticated | Returns system audit logs with date filtering |

---

## 8. Deployment & Administration Commands

### Database Schema Migration & Client Generation
```bash
# Navigate to backend directory
cd moa-ams-platform

# Generate typed Prisma SDK client
npx prisma generate

# Apply schema changes to PostgreSQL database
npx prisma db push
```

### Visual Database Administration
```bash
# Launch interactive Prisma Studio GUI on http://localhost:5555
npx prisma studio
```

### Server Application Launch
```bash
# Start backend Express server (Port 3000)
cd moa-ams-platform
npm run dev

# Build production frontend bundle
cd moa-ams-client
npm run build
```

---
*End of Technical Documentation*

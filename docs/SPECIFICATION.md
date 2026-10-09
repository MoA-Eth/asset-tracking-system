# Ministry of Agriculture – Asset & Store Management System (MoA-ATS)
## Functional Technical Specification (IFMIS Store Mirror & Executive Dashboard)

- **Target Organization:** Federal Democratic Republic of Ethiopia – Ministry of Agriculture (MoA)
- **Primary Frameworks:** React 18+ (Mobile-First PWA) | Node.js + Express (Backend REST API) | PostgreSQL (Prisma)
- **System Scope:** Store-Level Processing, IFMIS Slip Mirroring, and Top Management Visibility
- **Official System of Record:** Integrated Financial Management Information System (IFMIS)
- **Date:** October 2026

---

## 1. System Purpose & Core Concept

Top management and Directorate Heads currently lack real-time visibility into inventory levels, inbound shipments, and outbound requisitions handled in the central and regional stores.

While **IFMIS remains the national official system of record**, this system acts as a responsive store-level mirror:
1. **Duplicate Recording:** When items are received or issued in IFMIS, store Data Encoders record them here with the official IFMIS slip number, slip date and (optionally) a scanned copy.
2. **Two-Stage Approval:** Every request (receipt, issue, transfer, return, disposal) is endorsed by a Team Leader and then approved by a Department Head before it takes effect.
3. **Executive Dashboard:** Top management has real-time visibility into inventory value, category distribution, issues, stock waiting in store, and pending approvals.

All dates are kept in both the Gregorian (G.C.) and Ethiopian (E.C.) calendars.

---

## 2. Approval Workflow (all request types)

```
[ Data Encoder submits request ] ──► Pending, Stage 1
       │
       ▼ Team Leader endorses (or rejects with a reason)
[ Pending, Stage 2 ]
       │
       ▼ Department Head approves (or rejects with a reason)
[ Request takes effect ]
```
- A request can be corrected by the requester until it is endorsed; after that, an approver must reject it.
- Nobody can endorse, approve or reject a request they submitted.
- A rejection always records the reason, which the requester sees on the asset.
- An item can have only one open request at a time.
- Until approved, a printed voucher carries a "NOT YET APPROVED" banner; a rejected one is marked "REJECTED".

---

## 3. Major Functional Scenarios

### 3.1 Receiving – Model 19
- Data Encoder enters the items (name, category, serial, unit of measure, quantity, unit cost, store location) and the IFMIS receiving slip number and date.
- The receipt waits for approval (`PENDING_STOCK_IN`); once approved, the items are `AVAILABLE` in store.
- "Historical" receipts (goods received before the system) may be recorded without a scanned slip; they still go through approval.

### 3.2 Issue – Model 22
- Data Encoder issues available stock to a recipient employee and directorate, with purpose and the IFMIS issue voucher.
- The recipient is **internal** (an employee, with their directorate) or **external** (an outside organization, typed as text, with an optional contact person who signs for it). For an external recipient there is no employee and no directorate: after approval the record is "Issued", held by the organization, and the Assets list, the record, reports and the Model 22 voucher show the organization (and contact person) as the holder.
- Returning or transferring an item held by an outside organization is not supported yet; the system refuses it, and the Return and Transfer actions are not offered.
- **Partial issues** are supported: issuing part of a batch creates a separate record for the issued units, linked to the original receipt; the rest stays in store.
- Once approved, the issued units are `ISSUED` and the custodian is recorded.

### My assets (employees)
- Any employee can be given the **Employee** role. They sign in to one page, **My assets**, that lists the assets issued to them: item, serial number, quantity, condition, the date and slip it was assigned on, and whether a transfer or return is waiting for approval.
- It is read-only and personal: the server returns only what the signed-in person holds, with no costs, notes or other people's names, and the role is refused by every staff-wide endpoint.

### 3.3 Transfer and Return – Model 21
- **Transfer:** reassigns an issued asset to another employee, directorate or location. Custody changes only after approval.
- **Return to store:** brings an issued asset back to a store location, with its condition and any defects noted.
- Vehicle particulars (plate, engine, tires, accessories) can be recorded on the Model 21.

### 3.4 Disposal
- Removes assets from the register at the end of their life: damaged beyond repair, gifted or donated, obsolete, sold, lost, etc. The reason is written by the requester (common reasons are suggested).
- Only items **in store** (`AVAILABLE`) can be disposed of; an issued item is returned to store first.
- The request records: quantity, disposal reference number and date, reason, justification, condition, book value (defaults to unit price × quantity), recipient or buyer, proceeds (ETB), committee decision reference, and an optional supporting document (required when the slip policy requires attachments).
- While pending, the units stay in store with status `PENDING_DISPOSAL`. On approval they become `DISPOSED` and leave the stock balance; on rejection they return to `AVAILABLE`.
- **Partial disposals** are supported, like partial issues: the disposed units get their own record, the rest stays in store.
- The printed **Fixed Asset Disposal Form** follows the Ministry's form: public body, who it is sold, transferred or donated to, then per asset the tag number, serial number, disposal type (the reason), original cost, accumulated depreciation (original cost less book value), book value and remark. Chassis, engine and declaration numbers are left blank to write in. It ends with the recipient's statement and signature lines for the storekeeper, Team Leader, Department Head, FAMU accountant and recipient. It prints on A4 landscape.
- A rejected receipt has status `REJECTED`; `DISPOSED` only ever means an approved disposal.

### 3.5 Movement History
- Every asset keeps a chronological history of receipts, issues, transfers, returns, disposals and decisions.

### 3.6 System Settings
- The System Administrator decides whether a scanned slip is required on every voucher or optional.

---

## 4. Executive Dashboard & Reporting
- **Live KPIs:** total assets, in store, issued, pending approvals, pending disposals, inventory value (ETB). Disposed assets are left out of the totals.
- **Directorate allocation** and **category breakdown**.
- **Stock waiting in store:** items not issued within 30 days of arriving, oldest first (also flagged on the Assets page).
- **Monthly movement:** units received and issued over the last six months.
- **Reports and exports:** filtered asset reports and CSV exports (Assets, Reports, Audit Log) that open correctly in Excel, including Amharic text.

---

## 5. User Roles & Permissions

| Role | Responsibility | Main access |
|---|---|---|
| **System Administrator** | User access and platform governance; no store or approval work | Dashboard, reports, audit log, users, roles, employees, stores, system settings |
| **Data Encoder** | Records receipts, requests issues, transfers, returns and disposals; cannot approve | Assets, reports, employees and stores (view) |
| **Team Leader** | Stage 1: endorse or reject | Approvals, assets, reports, audit log |
| **Department Head** | Stage 2: approve or reject | Approvals, assets, reports, audit log |
| **Manager** (top management) | Monitors the portfolio; no approval authority | Dashboard, reports |

- Each directorate has at most one Team Leader, one Department Head and one Manager.
- Segregation of duties is enforced whatever the permission matrix says: whoever raises requests cannot approve them, and the System Administrator cannot do store or approval work. See [ROLES.md](ROLES.md).

---

## 6. Audit Log & Compliance
Every action records:
- Who performed it (user and role)
- When (E.C. and G.C.)
- What: e.g. `REGISTER_STOCK_IN`, `STOCK_OUT_REQUESTED`, `TRANSFER_REQUESTED`, `RETURN_REQUESTED`, `REGISTER_DISPOSAL`, `ENDORSE`, `APPROVE`, `REJECT`, edits of pending requests, and administrative changes (users, roles, employees, stores, settings)
- The affected item and IFMIS slip reference
- Details, with the state before and after where relevant

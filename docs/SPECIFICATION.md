# Ministry of Agriculture – Asset & Store Management System (MoA-ATS)
## Functional Technical Specification (IFMIS Store Mirror & Executive Dashboard)

- **Target Organization:** Federal Democratic Republic of Ethiopia – Ministry of Agriculture (MoA)
- **Primary Frameworks:** React 18+ (Mobile-First PWA) | Node.js + Express (Backend REST API)
- **System Scope:** Store-Level Processing, IFMIS Slip Mirroring, and Top Management Visibility
- **Official System of Record:** Integrated Financial Management Information System (IFMIS)
- **Date:** September 2026

---

## 1. System Purpose & Core Concept

Top management and Directorate Heads currently lack real-time visibility into inventory levels, inbound shipments, and outbound requisitions handled in the central and regional stores. 

While **IFMIS remains the national official system of record**, this system acts as a responsive store-level mirror:
1. **Duplicate Recording:** When items are registered or issued in IFMIS, store data encoders duplicate-register them here with the official IFMIS slip number and document attachment.
2. **Department Head Approvals:** Inbound stock and outbound issues require Department Head review and sign-off before items become available in stock or are released to custodians.
3. **Executive Dashboard:** Top management, including the **Minister**, has instant, real-time visibility into inventory valuation, category distribution, stock-out status, and pending approvals.

---

## 2. Major Functional Scenarios

### 2.1 Stock-In
```
[ IFMIS Delivery ] 
       │
       ▼ (Attach IFMIS Slip)
[ Data Encoder Registers Item ] ──► Status: PENDING_STOCK_IN
       │
       ▼ (Review & Sign-Off)
[ Department Head Approves ] ──► Status: AVAILABLE (In Central Store)
```
- Data Encoder enters item specifications (Name, Category, Serial, Valuation, Store Location).
- Data Encoder attaches the official IFMIS receiving slip number, slip date, and scanned document.
- Item enters `PENDING_STOCK_IN` status.
- Department Head reviews slip details and approves. Only after approval does the item become `AVAILABLE` in stock.
- Historical data can be marked to make slip attachment optional and bypass approval.

### 2.2 Stock-Out
```
[ Stock-Out Requisition ]
       │
       ▼ (Attach IFMIS Issue Slip)
[ Data Encoder Registers Issue ] ──► Status: PENDING_STOCK_OUT
       │
       ▼ (Authorization Review)
[ Department Head Approves ] ──► Status: ISSUED (Assigned to Custodian)
```
- Data Encoder selects an available item from store.
- Assigns recipient employee, department, purpose, and attaches the IFMIS Stock-Out voucher.
- Item transitions to `PENDING_STOCK_OUT`.
- Department Head reviews and approves/rejects.
- Once approved, item status updates to `ISSUED` and the active custodian is recorded.

### 2.3 Item Transfer & Reassignment
- Supports reassigning items between employees, directorates, or physical research center stores.
- Maintains a chronological movement history timeline for every asset.

---

## 3. Executive Dashboard & Reporting (For Minister & Directors)
- **Live KPIs:** Total Managed Assets, Available in Store, Issued to Staff, Pending Approvals, Total Inventory Valuation (ETB).
- **Directorate Allocation:** Distribution of equipment across Agricultural Extension, Horticulture, ICT, Procurement, Natural Resource Management.
- **Category Breakdown:** Vehicles, Agricultural Machinery, IT Equipment, Office Furniture, Lab Equipment, Field Gear.
- **Activity Stream:** Live audit feed of all store activities.

---

## 4. User Roles & Permissions
1. **👑 Top Management (Minister / State Minister / Directors):** Executive dashboard visibility, inventory breakdown, audit logs, and reports.
2. **✍️ Department Head / Approver:** Authorization queue for reviewing, approving, or rejecting Stock-In and Stock-Out requests.
3. **📦 Data Encoder (Storekeeper):** Registration of incoming goods, registration of stock-out issues, initiating transfers.

---

## 5. Audit Log & Compliance
Every transaction records:
- Who performed the action (User & Role)
- Timestamp (Ethiopian E.C. & Gregorian G.C.)
- Action (`REGISTER_STOCK_IN`, `APPROVE_STOCK_IN`, `REGISTER_STOCK_OUT`, `APPROVE_STOCK_OUT`, `TRANSFER_ITEM`)
- Affected item & IFMIS slip reference
- Context details

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
- Every item is identified as a **Fixed asset (ቋሚ ዕቃ)** or a **Consumable item (አላቂ ዕቃ)** (`itemType`, required on the receipt form, kept with the item and shown on the Assets list, its filter and the Model 19 voucher). It can be corrected while the receipt is pending and is locked once approved. Items from before this existed are fixed assets. Rules that differ by type are not defined yet.
- **Filling in from an IFMIS PDF:** when the attached slip is a PDF saved from IFMIS, the receipt form reads its text in the browser (bundled pdf.js, so it works offline) and fills only the fields still empty, then asks the user to check them against the paper. It reads the IFMIS Print Model19 Report (header, and the first item line read by column so wrapped descriptions and categories are joined; the IFMIS inventory item code goes into the remark) and the Fixed Asset Internal Transfer Form (Model 21: voucher number, date, Transfer Receipt, source location, and the first asset line with its tag number as the item code). Scanned PDFs and photos (PNG, JPEG, WEBP) carry no text, so they are read with OCR in the browser (tesseract.js with English data, served by the app at `/ocr/` so it works offline), then go through the same reader. Because OCR can misread, the note says the fields came from a scan, and an item line is used only when its unit of measure is known and quantity × unit price matches the total; otherwise only the header is filled.
- The receipt waits for approval (`PENDING_STOCK_IN`); once approved, the items are `AVAILABLE` in store.
- "Historical" receipts (goods received before the system) may be recorded without a scanned slip; they still go through approval.
- **Import Model 19 (receipts) from Excel:** in the ⋮ More actions menu at the top right of the receive form. One row is one receipt line with the receive form's fields; the file is read and checked in the browser (store, location and store man matched by name, category and item type by label, IFMIS category names or Amharic, and a row whose Model 19 No. and description are already registered is skipped), previewed, then each good row is registered through the normal receipt API as a historical receipt that waits for approval. Offered only while the scanned slip is optional. Each voucher gets its own import in that voucher's form header, with its own template and status rules, checked in the browser against the current items and pending requests:
  - **Model 22 issues** (issue form): items `AVAILABLE`, quantity up to what is in store; recipient by employee ID, directorate defaulting to theirs.
  - **Model 21 transfers** (transfer form): fixed assets `ISSUED` (not to an outside organization) or `AVAILABLE`; From, if given, must be the current custodian. Offered whatever the scan setting (transfers carry no slip).
  - **Disposals** (disposal form): items `AVAILABLE`, quantity up to what is in store (empty = all).
  - Every import skips an item that already has a pending request or appears twice in the file (one request per item at a time), and saves rows one by one through the same API as the form.

### 3.2 Issue – Model 22
- Data Encoder issues available stock to a recipient employee and directorate, with purpose and the IFMIS issue voucher.
- The recipient is **internal** (an employee, with their directorate) or **external** (an outside organization, typed as text, with an optional contact person who signs for it). For an external recipient there is no employee and no directorate: after approval the record is "Issued", held by the organization, and the Assets list, the record, reports and the Model 22 voucher show the organization (and contact person) as the holder.
- Returning or transferring an item held by an outside organization is not supported yet; the system refuses it, and the Return and Transfer actions are not offered.
- **Disposal through Model 22:** the Transaction type **Disposal (write-off)** writes units off on a Model 22 instead of the disposal form. It has no recipient; the purpose is the reason. It uses the same two-stage approval, and on approval the units are `DISPOSED` (a partial quantity splits off its own record); a rejection returns them to store. It sits alongside the separate disposal form, which remains for sales and donations that need the recipient and the Fixed Asset Disposal Form. In Oracle Inventory terms (which IFMIS runs on), scrap and write-off are an issue out of the store to an expense account.
- **Partial issues** are supported: issuing part of a batch creates a separate record for the issued units, linked to the original receipt; the rest stays in store.
- Once approved, the issued units are `ISSUED` and the custodian is recorded.

### Store men
- A **store man** is an employee assigned to a store (Settings → Stores). He needs no sign-in. A store can have several.
- His name goes in that store's dropdowns and on its vouchers: **Received by** (Model 19), **Issued by** (Model 22), the **Storekeeper** line of the disposal form, **Recorded by** on a transfer, and who takes an item back on a return (Model 21).
- A store that has store men always names one: with one he is the default, with several the request names which. **A store with none keeps working** (receiving, issuing, transfers, returns and disposals) and its vouchers name no store man. There is no setting for this. Users who can manage stores see a reminder listing such stores on the Dashboard and the Stores page until each has a store man.
- The name is saved with the request, so old vouchers keep it when the assignment changes. Requests made before this feature keep the name they had.

### My assets (employees)
- Any employee can be given the **Employee** role. They sign in to one page, **My assets**, that lists the assets issued to them: item, serial number, quantity, condition, the date and slip it was assigned on, and whether a transfer or return is waiting for approval.
- It is read-only and personal: the server returns only what the signed-in person holds, with no costs, notes or other people's names, and the role is refused by every staff-wide endpoint.

### 3.3 Transfer and Return – Model 21
- **Transfer:** reassigns a fixed asset to another employee or directorate. It can be issued to someone, or still in store: then its store man is the transferor and the asset becomes issued to the employee on approval. A consumable item is never transferred. Custody changes only after approval.
- **Return to store:** the same Transfer (Model 21) form, with **Return to store** set to a store. It brings an issued asset back to that store location, with its condition and any defects noted. There is one **Transfer (Model 21)** action and form; the request is still recorded as a return, so it keeps its own approval effect (the asset becomes In store).
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

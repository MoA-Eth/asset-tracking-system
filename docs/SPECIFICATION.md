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
- **Type of provision** (`provisionType`, Purchase by default, or Donation) is chosen on every Model 19. A donation is recorded without PO number, supplier/source, buyer, unit price or total amount: the form hides those fields and doesn't require them, the server stores none of them and records the unit price as 0 (so donated items add nothing to valuation totals), the transaction type defaults to Donation / Grant Receipt, and the record and printed Model 19 show the type and leave those fields out. It can be corrected while the receipt is pending.
- Every item is identified as a **Fixed asset (ቋሚ ዕቃ)** or a **Consumable item (አላቂ ዕቃ)** (`itemType`, required on the receipt form, kept with the item and shown on the Assets list, its filter and the Model 19 voucher). It can be corrected while the receipt is pending and is locked once approved. Items from before this existed are fixed assets. A fixed asset is one tagged item: a new receipt line of type FIXED must have quantity 1 (the form fixes it at 1 and greys it out, including the other lines of a multi-line slip; the server refuses anything else). Several of the same fixed asset are registered as one receipt each. Fixed-asset records with a larger quantity from before this rule keep it, and a correction that leaves it unchanged is accepted.
- **Filling in from an IFMIS PDF:** each voucher form reads only its own IFMIS voucher, as a PDF saved from IFMIS (text, read in the browser with the bundled pdf.js, so it works offline), through its header button or attachment. Only the fields still empty are filled, and the user checks them against the paper. Scanned PDFs and photos carry no text and are only attached; there is no OCR and no spreadsheet import.
  - **Receive form (Import receipt):** the IFMIS Print Model19 Report: header, and the first item line read by column so wrapped descriptions and categories are joined; the IFMIS inventory item code goes into the remark. A Model 21 is refused and sent to the transfer form. When the Model 19 No. and description match a receipt already registered, the user is warned with its item code. A multi-line slip lists the other lines under the form (item type and condition set by the user, category mapped from IFMIS); one submit sends them all in `items`, and each line becomes its own item record with its own approval.
  - **Transfer form (Import transfer):** the Fixed Asset Internal Transfer Form (Model 21): number, book, date, depreciation and book value, the asset by tag number and the recipient by employee ID. In the order of operations the asset must exist (received and approved), be a fixed asset `ISSUED` (not to an outside organization) or `AVAILABLE`, have no pending request, and, when issued, be held by the employee the form transfers it from; otherwise the asset and recipient are not filled and the reason is shown. The other assets of a multi-line form are checked the same way and listed; on submit each that fits is transferred as its own request with the same number, book, date and recipient, and its own depreciation and book value. A Model 19 is refused and sent to Receive items.
  - **Disposal form (Import disposal):** the Fixed Asset Disposal Form (Model 22/B): number, date, "Sold / Transferred / Donated to", and each asset with its tag, disposal type (printed above the line; mapped to the reason), original cost, accumulated depreciation and book value. This record's line sets the book value; every other asset is checked in the order of operations (received and approved, `AVAILABLE` in store, nothing pending) and each that fits is disposed of as its own request with the same reference, date, reason and recipient. A Model 19 or Model 21 is refused and sent to its own form.
  - **Model 19 figures** are placed by their column headings (Qty, Unit Price, Total Amount), since IFMIS prints a line's total and remark as one piece; the last three numbers are used only when the headings are missing. Petty Cash Purchase Receipt is a transaction type.
  - **Issue form:** no reading yet; it needs a sample Model 22 issue voucher PDF.
- The receipt waits for approval (`PENDING_STOCK_IN`); once approved, the items are `AVAILABLE` in store.
- "Historical" receipts (goods received before the system) may be recorded without a scanned slip; they still go through approval.

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

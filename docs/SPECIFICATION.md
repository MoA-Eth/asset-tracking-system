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
- One receipt is one Model 19. The form follows the voucher: the **IFMIS Model 19 PDF** at the top, then **Voucher** (Model 19 No., PO number, received date, transaction type, source, buyer, program), **Items** (one row per slip line) and **Store and signatures** (receiving store, received by, delivered by, signed copy). Each row becomes its own item record with its own approval; one submit sends them all in `items`, and every line is checked before any is saved.
- **Purchase or donation** (`provisionType`) follows the PO number, as on the IFMIS slip: with a PO number it is a purchase; without one, a donation. Nobody picks it. A donation is recorded without supplier/source, buyer, unit price or total: the form hides them, the server stores none and records the unit price as 0 (donated items add nothing to valuation totals), and the printed Model 19 prints PO Number, Source and Buyer empty, with no prices or grand total. A purchase registered before this rule without a PO number stays a purchase when corrected.
- **Fixed asset (ቋሚ ዕቃ) or consumable (አላቂ ዕቃ)** (`itemType`) follows the first digit of the **IFMIS item code** (`ifmisItemCode`, required on every row): **1 is a consumable, 0 a fixed asset**. The form shows it beside the code; nobody picks it, and the server refuses a type that the code contradicts. A fixed asset is one item: its row has quantity 1 (greyed out), and several of the same fixed asset are one row each.
- **Codes:** every record gets its own code from the system (e.g. `MOA-ITC-2026-0001`); the physical tag number is not asked on receipt. A tag sent by an older client is still used as the code and must be unique. Search finds records by their code, IFMIS tag number or IFMIS item code.
- **IFMIS tag number:** a fixed asset may carry the tag number IFMIS gave it (e.g. `MOA-016341`), as printed on its Model 21 and disposal form. It is optional, saved in capitals, unique across assets (no other asset may have it as its tag or its record code, ignoring case), and set or cleared on the record or from a Model 21 / disposal form PDF that names an unknown tag (`PATCH /api/items/:id/ifmis-tag`, for `stock-in.write`, `transfers.write` or `disposals.write`; audited as `SET_IFMIS_TAG`). Uniqueness is checked by the server rather than a database index, so deploys add the column without an upgrade step. Consumables have none.
- **Not asked on receipt:** physical condition (records start as New), serial number and remark. A correction keeps what an older record has.
- **Filling in from an IFMIS PDF:** each voucher form reads only its own IFMIS voucher, as a PDF saved from IFMIS (text, read in the browser with the bundled pdf.js, so it works offline). Only the fields still empty are filled, and the user checks them against the paper; the PDF is shown open in **Slip preview** at the bottom of the form (without the viewer's thumbnail panel). Scanned PDFs and photos carry no text: there is no OCR.
  - **Receive form:** the IFMIS Print Model19 Report fills the header, **every item line as a row** (code and with it the type, description, category mapped from IFMIS, unit, quantity, unit price, sub inventory), the program printed above the title, and the signature lines (delivered by; received by, which also sets the store). Figures are placed by their column headings (Qty, Unit Price, Total Amount), since IFMIS prints a line's total and remark as one piece. When the Model 19 No. and description match a receipt already registered, the user is warned with its record code. Another PDF replaces what the previous one filled in, including its rows; what the user typed stays. A Model 21, Model 22 or disposal form is refused and not attached.
  - **Issue form:** see 3.2.
  - **Transfer form** (the IFMIS Model 21 PDF box at the top): the Fixed Asset Internal Transfer Form (Model 21): number, book, date, depreciation and book value, the asset by tag number (its IFMIS tag number first, then its record code, then its serial number) and the recipient by employee ID. A tag no asset has can be recorded on the asset it is, and the form is read again. In the order of operations the asset must exist (received and approved), be a fixed asset `ISSUED` (not to an outside organization) or `AVAILABLE`, have no pending request, and, when issued, be held by the employee the form transfers it from; otherwise the asset and recipient are not filled and the reason is shown. The other assets of a multi-line form are checked the same way and listed; on submit each that fits is transferred as its own request with the same number, book, date and recipient, and its own depreciation and book value. A Model 19 is refused and sent to Receive items.
  - **Disposal form** (the IFMIS disposal form PDF box at the top): the Fixed Asset Disposal Form (Model 22/B): number, date, "Sold / Transferred / Donated to", and each asset with its tag, disposal type (printed above the line; taken as printed, e.g. TRANSFER), serial number, original cost, accumulated depreciation and book value. A line names its asset by tag (IFMIS tag, then record code) or, failing that, by its serial number, so an asset received with its serial is found before its IFMIS tag is recorded. Each line is read as the band from just above its number to the next, since IFMIS prints the type above, wraps the description and sets the figures lower. This record's line sets the book value; every other asset is checked in the order of operations (received and approved, `AVAILABLE` in store, nothing pending) and each that fits is disposed of as its own request with the same number, date, disposal type and recipient. A Model 19 or Model 21 is refused and sent to its own form.
- **Signed copy:** the IFMIS printout, signed and scanned (or photographed), is attached under **Signed copy** and kept as the receipt's copy; it is never read. Until one is added, the IFMIS PDF is kept as the copy. A scan given in the IFMIS PDF box is moved to Signed copy and clears nothing. When the slip policy requires attachments, the signed copy is what is required.
- The receipt waits for approval (`PENDING_STOCK_IN`); once approved, the items are `AVAILABLE` in store.
- "Historical" receipts (goods received before the system) may be recorded without a scanned slip; they still go through approval.

### 3.2 Issue – Model 22
- Opened from an in-store asset's **⋮ → Issue (Model 22)**. The form follows the voucher: the **IFMIS Model 22 PDF** at the top, then **Voucher** (Model 22 No., issued date, transaction type), **Items** (one row per line: the store item, unit, what is in store, quantity, unit price and total, then transport cost and grand total) and **Recipient and signatures** (received by, issued by, signed copy), with **Slip preview** at the bottom. Unit and unit price are the item's, as received on Model 19.
- **Several lines per Model 22:** each row is its own issue request with the voucher's details (sent as `lines`); every line is checked before any is saved, the rows must come from **one store**, and the same store item can be on one row only. The transaction type is kept with each request, and the transport cost with the first.
- **Reading the IFMIS PDF:** it fills the header, the transport cost and every line, matched to the store item with the same **IFMIS item code** and enough in store; lines with the same code are combined into one row with the total quantity, and a line not in store under its code is marked for the user to choose the item or remove the row. A report holding several vouchers is read for the first one, and the user is told. The Received By name picks the employee, or the listed organization (by name or short name); a name that is neither is offered to add as an organization. The Issued By name picks the store man. Names match in any order and ignore notes in brackets.
- **Received by** is one picker listing **employees** and **organizations** together; there is no internal / external choice. An employee brings their directorate (required, editable). An organization brings its usual contact person (editable) and has no employee or directorate: after approval the record is "Issued", held by the organization, and the Assets list, the record, reports and the Model 22 voucher show the organization (and contact person) as the holder. An organization not in the list can be added from the picker.
- **Organizations** are a managed list (Settings → Organizations): name (unique, ignoring case and spacing), short name and usual contact person. Whoever can issue items can add one; System Administrators edit, deactivate and reactivate them. Deactivated organizations are not offered on the form, and past records keep the name. The issue request keeps the organization's id and name. On first start, organizations typed on earlier issues were gathered into the list, once each.
- Items held by an outside organization are not returned or transferred through the system; the Return and Transfer actions are not offered for them.
- **No purpose of issue:** it is not on the IFMIS Model 22. A correction keeps an older request's purpose.
- **Disposal through Model 22:** the box **Mark as disposal** on the issue form turns it into a write-off (transaction type Disposal, `disposal` on the request). It has no recipient and asks for the **reason for disposal** (required); unticking it returns to the issue's transaction type. The approvals page shows it as "Model 22 (DISPOSAL)", the asset as "Disposal pending", and the printed voucher is titled "Articles Or Property Disposed Of (Write-off)", with the disposal date, the reason and "Disposed By" in place of the recipient. It uses the same two-stage approval, and on approval the units are `DISPOSED` (a partial quantity splits off its own record); a rejection returns them to store. It sits alongside the separate disposal form, which remains for sales and donations that need the recipient and the Fixed Asset Disposal Form. In Oracle Inventory terms (which IFMIS runs on), scrap and write-off are an issue out of the store to an expense account.
- **Partial issues** are supported: issuing part of a batch creates a separate record for the issued units, linked to the original receipt; the rest stays in store.
- The printed Model 22 follows the IFMIS voucher: the Item column shows the IFMIS item code, and the Remark column is empty.
- Once approved, the issued units are `ISSUED` and the custodian is recorded.

### Store men
- A **store man** is an employee assigned to a store (Settings → Stores). He needs no sign-in. A store can have several.
- His name goes in that store's dropdowns and on its vouchers: **Received by** (Model 19), **Issued by** (Model 22), the **Storekeeper** line of the disposal form, **Recorded by** on a transfer, and who takes an item back on a return (Model 21).
- A store that has store men always names one: with one he is the default, with several the request names which. **A store with none keeps working** (receiving, issuing, transfers, returns and disposals) and its vouchers name no store man. There is no setting for this. Users who can manage stores see a reminder listing such stores on the Dashboard and the Stores page until each has a store man.
- The name is saved with the request, so old vouchers keep it when the assignment changes. Requests made before this feature keep the name they had.

### My assets (employees)
- Any employee can be given the **Employee** role. They sign in to one page, **My assets**, that lists the assets issued to them: item, serial number, quantity, the date and slip it was assigned on, and whether a transfer or return is waiting for approval.
- It is read-only and personal: the server returns only what the signed-in person holds, with no costs, notes or other people's names, and the role is refused by every staff-wide endpoint.

### 3.3 Transfer and Return – Model 21
- **Transfer:** reassigns a fixed asset to another employee or directorate. It can be issued to someone, or still in store: then its store man is the transferor and the asset becomes issued to the employee on approval. A consumable item is never transferred. Custody changes only after approval.
- **Return to store:** the same Transfer (Model 21) form, with **Return to store** set to a store. It brings an issued asset back to that store location, with any defects noted; condition is not asked (the asset keeps the one it has). There is one **Transfer (Model 21)** action and form; the request is still recorded as a return, so it keeps its own approval effect (the asset becomes In store).
- Vehicle particulars (plate, engine, tires, accessories) can be recorded on the Model 21.

### 3.4 Disposal
- Removes assets from the register at the end of their life, on the IFMIS Fixed Asset Disposal Form (Model 22/B). The **disposal type** is recorded as IFMIS prints it, in capitals (TRANSFER, DONATION, SALE and SCRAP are suggested; another can be typed); it is stored as the request's reason.
- Only items **in store** (`AVAILABLE`) can be disposed of; an issued item is returned to store first.
- The request records: quantity, the form's No. and date, disposal type, remark, book value (defaults to unit price × quantity, the original cost), who it is sold, transferred or donated to (active organizations are suggested), the store man, and a copy: the signed form, scanned, or else the IFMIS PDF it was read from (required when the slip policy requires attachments). Proceeds and a committee decision reference are no longer asked; older requests keep them and a correction preserves them.
- While pending, the units stay in store with status `PENDING_DISPOSAL`. On approval they become `DISPOSED` and leave the stock balance; on rejection they return to `AVAILABLE`.
- **Partial disposals** are supported, like partial issues: the disposed units get their own record, the rest stays in store.
- The printed **Fixed Asset Disposal Form** follows the IFMIS form: public body, who it is sold, transferred or donated to, number and date, then per asset the tag number (the IFMIS tag number when the asset has one, else its record code), serial number, disposal type (the reason), original cost, accumulated depreciation (original cost less book value), book value and remark. Chassis, engine and declaration numbers are left blank to write in. No totals, as on IFMIS. It ends with the recipient's statement and signature lines for the storekeeper, FAMU accountant and recipient. It prints on A4 landscape.
- A rejected receipt has status `REJECTED`; `DISPOSED` only ever means an approved disposal.

### 3.5 Movement History
- Every asset keeps a chronological history of receipts, issues, transfers, returns, disposals and decisions.

### 3.6 System Settings
- **Scanned slip field in forms:** The System Administrator can toggle between single file uploader mode (default: Off) where one IFMIS PDF uploader is used for both autofilling and attaching the slip, and dual uploader mode (On) where a separate "Signed copy" field is displayed for paper scans.
- **Slip attachment policy:** The System Administrator decides whether attaching a slip is required on every voucher or optional.

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

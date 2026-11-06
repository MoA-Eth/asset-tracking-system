# Ministry of Agriculture — Asset Tracking System (MoA-ATS)
## Session Handover & State Snapshot (2026-11-06)

This document preserves the complete technical and operational context of the inventory duplicate detection and audit resolution work, so you can immediately continue on any other machine.

---

### **1. Key System & Server Details**
* **Production Server**: `10.10.20.155` (Host name: `moaasset`, Domain: `ams.moa.gov.et`)
* **SSH User**: `assetmgtp@10.10.20.155`
* **App Directory**: `/opt/moa-ams`
* **Live Containers**:
  * `moa-ams-nginx-1` (Web App PWA + HTTPS, ports 80/443)
  * `moa-ams-backend-1` (Node.js API, port 3000)
  * `moa-ams-db-1` (PostgreSQL 16, port 5432)
* **API Health Check**: `https://localhost/api/health` or `https://10.10.20.155/api/health`
* **Pre-Deploy Database Backup**: `/opt/moa-ams/backups/pre-deploy-2026-11-06_165324.dump`
* **Git Repository**: `https://github.com/MoA-Eth/asset-tracking-system.git` (Branch: `main`)
* **Latest Commit Live**: `4ed8158` (`fix(assets): broaden duplicate detection to all active items with price matching and bidirectional navigation`)

---

### **2. What Was Built & Deployed Today**

1. **Large Bulk Import Fix (`12f9422`)**:
   * Increased Express JSON body parser limit to `10mb` (`express.json({ limit: '10mb' })`) to accommodate multi-page Excel count uploads.

2. **Duplicate Detection & Interactive Filter (`12988f4`, `6df0706`, `4ed8158`)**:
   * **Filter Pill in Status Bar**: Clickable pill `[⚠️ Suspected Duplicates (40)]` in `AssetsPage.tsx` filtering all 71 related records (40 duplicate suspects + 31 pre-existing originals).
   * **Table Row Match Badges**:
     * Suspect items show: `⚠️ Possible Duplicate` and `↳ Matches original: [MOA-...] (Item Name) on Model 19 #... [STATUS]`.
     * Pre-existing originals show: `Original Asset` and `↳ Duplicated by: [MOA-...] on Model 19 #...`.
     * Clicking either code pill instantly opens the corresponding item in the side drawer.
   * **Side-by-Side Comparison Drawer**: In `AssetRecord.tsx`, opening any duplicate shows an amber/blue comparison banner showing both records side-by-side with an `[👁️ Inspect Pre-Existing Asset]` button.
   * **Clean Removal Toggle**: Setting `ENABLE_DUPLICATE_DETECTION = false` in `frontend/src/utils/duplicate-detection.ts` cleanly disables all duplicate UI helpers anytime.

3. **Super Admin Deletion Actions (`49c9a0d`)**:
   * **Row Action Menu (`...`)**: Super Admin can permanently delete:
     * `Delete Item (Super Admin)` (`DELETE /api/items/:id`)
     * `Delete Entire Model 19 #... (Super Admin)` (`DELETE /api/items/slip/:slipNumber`)
   * Fully cleans up item balances, transaction approvals, and logs audit events (`SUPER_ADMIN_DELETE_ITEM` / `SUPER_ADMIN_DELETE_SLIP`).
   * Confirmation modals prevent accidental clicks.

---

### **3. Audit Findings & Critical Alerts**

1. **Today's Imported Items**: 849 items imported across 19 count batches on 2026-11-06. All are currently in **`PENDING_STOCK_IN`**.
   * ⚠️ **Do NOT approve** these batches yet until duplicate items are resolved.
2. **Zero-Price Items (52%)**: **445 items out of 849** have `unitCostETB = 0.00` because physical count sheets lacked purchase invoices. Storekeepers must check if these match existing assets with recorded prices.
3. **Full 100% Duplicate Vouchers**:
   * **`#0000307` vs `#0000422`**: Identical 27 items totaling `191,090.00 ETB` each. One of these slips is a complete duplicate.
   * **`#0000052` vs `PENDING-1792587705527`**: Identical 8 PVC pipe items totaling ~`55,000.00 ETB`.
   * *Resolution*: Use Super Admin **`Delete Entire Model 19`** to delete the duplicated voucher in one click.
4. **Items Counted that Were Previously Disposed**:
   * Several guest chairs (`6,910.67 ETB`), swivel chairs (`8,857.47 ETB`), and tablets (`89,700.00 ETB`) were previously marked **`DISPOSED`** in the system, but re-counted during physical count. Committee must decide whether to delete the count entry or keep them.

---

### **4. Generated Excel Reports**
All files are saved in the project repository at `exports/` and backed up on the production server at `assetmgtp@10.10.20.155:/home/assetmgtp/inventory-audit-exports/`:

1. **`exports/Today_vs_Existing_Name_And_Price_Overlaps.xlsx`**:
   * **Tab 1 (`Exact Name & Same Price`)**: 17 rows with exact description and exact unit price match.
   * **Tab 2 (`Same Name - Different Price`)**: 169 rows with exact description but different unit costs (different procurement batches).
2. **`exports/3_MoA_Inventory_Audit_Master_Comparison_2026-11-06.xlsx`**:
   * Complete 3-tab master audit workbook (Side-by-Side compare, full pre-existing list of 683 items, and full today imported list of 849 items).
3. **`exports/1_Pre_Existing_Assets_Before_Today.xlsx`**: Full raw dataset of 683 pre-existing records before Nov 6, 2026.
4. **`exports/2_Imported_Physical_Count_Today.xlsx`**: Full raw dataset of 849 today's imported records with duplicate flags.

---

### **5. CI/CD & Pipeline Status**
- **Test suite**: `AssetsPage.test.tsx` (128/128 tests passing) and `duplicate-detection.test.ts` (6/6 tests passing).
- **Split Units Fix**: Excluded parent-child batches (`parentItemId` / `itemCode` prefix) and sibling split units from duplicate suspect matching.

---

### **6. How to Continue on a New Machine**

1. **Clone or Pull the Repository**:
   ```bash
   git clone https://github.com/MoA-Eth/asset-tracking-system.git
   # OR if already cloned:
   git pull origin main
   ```
2. **Open the Project in Antigravity** on the new machine.
3. **Resume Prompt to Give to Antigravity**:
   > *"I am continuing the inventory duplicate detection and audit task. Please read `CONTEXT_HANDOVER.md` to see the complete project status, deployed commits, and audit findings, and let me know our next steps."*


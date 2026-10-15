# IFMIS sample vouchers

Real IFMIS PDFs, shared for testing the slip reader (`src/utils/slip-reader.ts`):

- `ifmis-model19-petty-cash.pdf`: a Model 19 receipt (petty cash fuel purchase, 4 lines, blank PO/source/buyer).
  Its rows are also in `src/utils/slip-reader-model19.test.ts` (`REAL_PETTY_CASH`).
- `ifmis-model22-issue.pdf`: a Model 22 issue voucher (2 pages). The receive form must refuse it.

Synthetic samples, made with the same layout and column positions as the real Model 19, to show every field filled
in. They say in their footer that they are not IFMIS documents.

- `sample-model19-po-receipt.pdf`: Model 19 No. 0000123 with a PO number (so a purchase), source, buyer, program,
  both signature names and 3 lines: a laptop (code 0…, fixed asset), A4 paper and fuel coupons (code 1…,
  consumables). Received by "Mamo, Abebech Dejene", the store man of Head office in the demo data, so the store fills
  in too. Grand total 127,500.
- `sample-model19-donation.pdf`: Model 19 No. 0000124 with no PO number (so a donation) and 2 lines: a soil testing
  kit (fixed asset) and wheat seed (consumable).
- `sample-model22-issue.pdf`: Model 22 No. 0000201/A Inventory, laid out like the real one: Mobile Card ×20 and fuel coupons on two lines (10 + 5, combined into one row), an umbrella line that is not in the demo stores, a transport cost of 300, and both signature names (Issued by "Tesfaye, Hiwot", the Saris store man; Received by "Tolosa, Kassahun"). Open **Issue (Model 22)** on an item of the Saris store and choose it.

- `sample-disposal-transfer.pdf`: Fixed Asset Disposal Form (Model 22/B) No. 0001765/2018, laid out like a photographed
  IFMIS printout: the disposal type (TRANSFER) printed above each line number, descriptions over two lines, and the
  tag, serial and figures set a little lower. Sold / Transferred / Donated to "East Shawa Zone Agriculture
  Office/Umer Ahmed", 4 lines matching the local demo records. Open **Dispose** on `MOA-IT-2024-0001` (Dell
  Latitude 5540, Kality) and choose it:
  1. the Dell itself, named by an IFMIS tag (MOA-004344) it doesn't have yet, so found by its serial number; book value 0;
  2. the HP printer by its record code (MOA-IT-2026-0075): will be disposed of;
  3. the Epson scanner by its serial number (SLIP-TEST-02): will be disposed of;
  4. a laptop no record has (MOA-004242): not disposed of, and the form offers to record its tag on an asset.

Upload them on the Receive items form to check what is filled in. The Model 21 and disposal samples go on the transfer
and disposal forms of an asset.

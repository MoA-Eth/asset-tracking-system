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

Upload them on the Receive items form to check what is filled in.

# IFMIS sample vouchers

Real IFMIS PDFs, shared for testing the slip reader (`src/utils/slip-reader.ts`):

- `ifmis-model19-petty-cash.pdf`: a Model 19 receipt (petty cash fuel purchase, 4 lines, blank PO/source/buyer).
  Its rows are also in `src/utils/slip-reader-model19.test.ts` (`REAL_PETTY_CASH`).
- `ifmis-model22-issue.pdf`: a Model 22 issue voucher (2 pages). The receive form must refuse it.

Upload them on the Receive items form to check what is filled in.

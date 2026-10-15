# The Assets register

**Assets** lists every asset from receipt to custody. It is where the Data Encoder works, and where Team Leaders and Department Heads follow what is happening (they can view and print, not change).

## Find an asset

1. Type in **Search** to find by name, code, IFMIS tag number, serial number, slip number or person.
2. Press **Filter** to narrow the list: **Lifecycle status** (In store, Issued, Pending, Rejected, Disposed), **Store and custody location**, **Asset category**, **Item type** (fixed asset or consumable), and **Time in store** (over 30 days).
3. Click a column heading to sort. Active filters show as chips you can remove. **Clear** resets everything.
4. **Export CSV** saves every row that matches your filters, not only the page you see.

Your search, filters and sort are remembered on your computer.

## What the statuses mean

| Status | Meaning |
| :--- | :--- |
| **Receipt pending** | A Model 19 receipt is waiting for approval. Not usable yet. |
| **In store** | Approved and available to issue or dispose of. |
| **Partly issued** | A batch with some units out and some still in store. |
| **Issued** | With a staff member or an outside organization. |
| **Issue / Transfer / Return / Disposal pending** | A request is open. The second line says who has it: **With Team Leader** (Stage 1) or **With Dept. Head** (Stage 2). |
| **Rejected** | A receipt that was rejected (kept as a record), or a red note on a record whose latest request was rejected, with the reason. |
| **Disposed** | Written off. Kept for the record. |

An amber **N days in store** means the asset has waited more than 30 days and should be issued.

## Open an asset

1. Click a row. The **⋮** menu on a row holds only what can be done next (issue, transfer, dispose, edit a pending request); it has no view or print.
2. The record fills the page. Close it with **×** at the top right (or **Esc**) to return to your list as you left it. The **Previous / Next** arrows beside it (or the Up and Down keys) move through the list.
3. The record shows the voucher and procurement details, the item, signatures and the scanned slip, who holds it, and every request made on it.
4. The buttons at the top are the next steps that apply to this asset. They depend on its status and on your role.

## IFMIS tag number

IFMIS gives every fixed asset its own tag number (e.g. MOA-016341) and prints it on the Model 21 and the disposal form. A Model 19 doesn't carry it, so a record received here has only its own **record code** until the tag is added.

- **On the record:** under **IFMIS tag number**, press **Add** (or **Change**), type the tag and press Enter. Leave it empty to remove it. Anyone who receives, transfers or disposes of assets can do this.
- **From a PDF:** when a Model 21 or disposal form names a tag no asset has, the form says so and asks which asset it is. Pick it and press **Save as its IFMIS tag**; the form is read again and finds it.

A tag belongs to one asset only. Once recorded, PDFs find the asset by it, search finds it, and the printed Model 21 and disposal form show it in place of the record code.

## Batches

A delivery is one row. Units issued out of it appear underneath (**Show N records**), and the quantity reads like "3 issued · 7 in store".

## Printing

Open the record and, under its list of requests, press **Print** on the request: **Model 19** (receipt), **Model 22** (issue), **Model 21** (transfer or return) or the **disposal form**. A request that is not yet approved prints with a "NOT YET APPROVED" banner; print the signed copy after approval.

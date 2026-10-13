# Issuing items (Model 22)

Use this to hand items from the store to a staff member, or to an outside organization. The items stay in store until the request is approved at both stages.

## Before you begin

- [ ] You have the Model 22 slip number.
- [ ] You know who receives the items, and the purpose.
- [ ] If scanned slips are required, you have the scan.

## Issue an item

1. On **Assets**, open the **⋮** menu of an **In store** asset and choose **Issue (Model 22)**.
2. **Voucher details:** enter the **Model 22 No.**, the **Issued date** and the **Transaction type** (Move Order Issue, Direct Store Issue, Department Assignment, Project Allocation or Disposal).
3. **Item issued:** check the item. Enter the **Quantity to issue**, a whole number up to what is in store. You can issue **part** of a batch: those units get their own record and the rest stays in store.
4. **Recipient and custody:** choose the **Recipient type**:
   - **Internal (employee):** pick the person in **Received by** (type a name or employee ID). Their directorate fills in; change it if needed.
   - **External (organization):** type the **Organization**, and optionally the **Contact person** who signs for it. There is no employee or directorate.
5. **Issued by (store man)** shows the store man of the store the item is in. With several, choose one. Enter the **Purpose of issue** and, if you like, a remark. Attach the scan.
6. Press **Submit for approval**. It stays off until the required fields (*) are filled. The Model 22 voucher opens for printing.

## Dispose of stock through Model 22

To write units off on a Model 22 instead of the disposal form, choose **Disposal (write-off)** as the **Transaction type**. The recipient fields go away and **Purpose of issue** becomes the **Reason for disposal** (for example expired, damaged or used up). The rest is the same: quantity, **Issued by (store man)**, slip and scan. It goes through the same two approvals. When approved, the units leave the register as **Disposed**, and a partial quantity splits off its own record. The Model 22 voucher prints with the transaction type **Disposal**. Use the **Dispose** action instead when you need the Fixed Asset Disposal Form, for example to record who the items were sold or given to.

## After submitting

- The asset shows **Issue pending**, with **With Team Leader** or **With Dept. Head**.
- Until the Team Leader endorses it, choose **Edit issue** to correct the recipient, quantity, slip or purpose. After that it is locked.
- **Approved:** the asset becomes **Issued** to the recipient. **Rejected:** it stays in store, and the reason shows on the asset.

> An asset issued to an outside organization cannot be returned or transferred through the system yet. To issue a different item than the one in a pending request, ask an approver to reject it and start again.

## Import many issues from Excel

Open the issue form of any item and press **Import items** at the top right and choose the Excel or CSV file (the import window also has **Download template**). Fill in one row per issue: Model 22 No., issued date, item code, quantity, recipient (8-digit employee ID) and purpose are required; the directorate defaults to the recipient's.

Only items **in store** can be issued, up to the quantity in store; a row naming an item that is issued, pending or disposed is skipped, saying its status. Choose the file (.xlsx or .csv): every row is checked first and rows with a problem are listed with the reason; nothing is saved until you press **Import**. Each good row becomes its own request and waits for Team Leader endorsement and Department Head approval. An item that already has a request waiting is skipped, so importing the same file again does not duplicate anything. The import is not offered while every voucher must have its scanned slip.

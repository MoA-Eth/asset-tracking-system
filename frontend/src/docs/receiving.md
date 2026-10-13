# Receiving items (Model 19)

Use this when new items arrive. Registering a receipt creates the asset record. It stays **Receipt pending** until the Team Leader endorses it and the Department Head approves it.

## Before you begin

- [ ] You have the Model 19 slip, with its number and the received date.
- [ ] You know the store and the shelf or room where the items will be kept.
- [ ] If your administrator requires scanned slips, you have the scan (PDF, PNG, JPEG or WEBP, up to 10 MB).

## Register a receipt

1. On **Assets**, press **Receive items (Model 19)**.
2. **Voucher and procurement:** enter the **Model 19 No.**, **Received date**, **Transaction type** (PO Receipt, Direct Delivery, Donation / Grant Receipt, Transfer Receipt or Internal Production), **Source** (supplier or vendor) and the **Receiving store** (the goods are recorded at the store; there is no location to choose). PO number, buyer and program are optional.
3. **Item received:** enter the **Item description**, **Category**, **Item type** (a **Fixed asset**, ቋሚ ዕቃ, or a **Consumable item**, አላቂ ዕቃ), **Physical condition**, **Quantity**, **Unit of measure** (EA, KG, BOX…) and **Unit price (ETB)**. The total is worked out for you. Leave **Item code** empty to have one made; it cannot change later. Serial number and a remark are optional.
4. **Delivery and attachment:** enter who delivered, and attach the scan. **Received by (store man)** is the store man of the receiving store: if the store has one, he is filled in; if it has several, choose one. If the store has none, the receipt still goes ahead with no store man named; ask your System Administrator to assign one.
5. Press **Submit for approval**. The button stays off until every required field (*) is filled, and it says so beside it.
6. The Model 19 voucher opens so you can print it.

> One receipt registers one item line, with its quantity. For several different items on one slip, register each as its own receipt with the same Model 19 number.

## Fill in from an IFMIS PDF or scan

If you have the voucher as a **PDF downloaded from IFMIS**, a **scanned PDF** or a **photo** (PNG, JPEG or WEBP), attach it in **Delivery and attachment** first. Or press **Import receipts** at the top right of the receive form and pick the file; it is attached and read, and anything you already typed is kept. The form reads it and fills in what is still empty. A note under the attachment lists what was filled. **Check every filled field against the paper** before submitting; nothing is submitted for you. Anything you had already typed is kept.

- **Model 19 (Print Model19 Report):** Model 19 No., PO number, received date, transaction type, source, buyer and program, and the first item: description, category, unit of measure, quantity and unit price. The IFMIS item code goes into the **Remark**, because every delivery of that item shares it.
- **Fixed Asset Internal Transfer Form (Model 21):** voucher number, date, **Transfer Receipt**, the source location, and the asset: description, item code (the IFMIS tag number), quantity, unit price and **Fixed asset**.
- A PDF printed from this app, or any other PDF, is not an IFMIS form: the note says so.
- A **scanned** PDF or a **photo** is read with text recognition, which takes a few seconds. A scan can be misread, so check each filled field with extra care. The voucher details at the top read well even from a phone photo. An item line is filled in only when its quantity, unit price and total agree; if no line on the scan reads cleanly, the note says so and you type the item yourself. A flat, straight, well-lit scan reads best.
- If nothing could be read, the note says so. The slip stays attached; fill in the fields as usual.
- A slip that lists several items fills in the first one; register each of the others as its own receipt with the same Model 19 No.

## Correct a mistake

Until the Team Leader has endorsed it, open the receipt and choose **Edit receipt**, change what is wrong, and press **Save changes**. Every change is recorded. After the Team Leader endorses it, editing is locked: ask an approver to reject it, then register it again.

## After approval

The asset becomes **In store** and can be issued. If it is **rejected**, it stays on record as **Rejected** with the reason, and you can register it again.

## Import many receipts from Excel

For opening stock, or many receipts at once, open **Receive items**, press **Import receipts** at the top right and choose an Excel or CSV file. The same button takes a slip or a spreadsheet: the app tells them apart by the file type. Each voucher has its own import in its own form (Model 22 in the issue form, Model 21 in the transfer form, disposals in the disposal form), because each spreadsheet has its own columns and rules.

1. Press **Download template** and fill in one row per receipt line, the same as one **Receive items** form: Model 19 No., received date, store, item description, category, item type, unit of measure, quantity and unit price are required. An empty condition is recorded as Good. If the store has several store men, fill in **Received by (store man)**.
2. Choose the file (.xlsx or .csv). You see every row first: rows with a problem are listed with the reason and skipped; nothing is saved yet.
3. Press **Import**. Each good row becomes its own receipt, marked historical, with no scanned slip. It waits for Team Leader endorsement and Department Head approval like any other receipt.

A row with the same Model 19 No. and description as a receipt already registered is skipped, so importing the same file again does not create duplicates. The import is not offered while the System Administrator requires a scanned slip on every receipt.

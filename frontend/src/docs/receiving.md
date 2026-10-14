# Receiving items (Model 19)

Use this when new items arrive. Registering a receipt creates the asset record. It stays **Receipt pending** until the Team Leader endorses it and the Department Head approves it.

## Before you begin

- [ ] You have the Model 19 slip, with its number and the received date.
- [ ] You know the store and the shelf or room where the items will be kept.
- [ ] If your administrator requires scanned slips, you have the scan (PDF, PNG, JPEG or WEBP, up to 10 MB).

## Register a receipt

1. On **Assets**, press **Receive items (Model 19)**.
2. **Voucher and procurement:** choose the **Type of provision**: **Purchase** (the default) or **Donation**. Donated items have no PO number, supplier, buyer or price, so for a donation those fields are hidden, the transaction type becomes **Donation / Grant Receipt**, and the printed Model 19 leaves out the prices and grand total. Then enter the **Model 19 No.**, **Received date**, **Transaction type** (PO Receipt, Direct Delivery, Donation / Grant Receipt, Transfer Receipt or Internal Production), **Source** (supplier or vendor) and the **Receiving store** (the goods are recorded at the store; there is no location to choose). PO number, buyer and program are optional.
3. **Item received:** enter the **Item description**, **Category**, **Item type** (a **Fixed asset**, ቋሚ ዕቃ, or a **Consumable item**, አላቂ ዕቃ), **Physical condition**, **Quantity**, **Unit of measure** (EA, KG, BOX…) and **Unit price (ETB)**. The total is worked out for you. A **fixed asset is one item**, so its quantity is 1 and greyed out: for several (for example 10 laptops), register each as its own receipt; **Duplicate as new receipt** saves retyping. If a Model 19 line lists several of a fixed asset, the form takes one and says so. How the item is identified depends on its type: a **fixed asset** needs its **Tag number** (e.g. MOA-072351), which becomes its item code and must not be in use already; a **consumable** needs its **Item code** (the inventory code from IFMIS, e.g. 108101101.0021, the same on every delivery) and gets its own record code as well. Neither can change after registration, except a consumable's item code while the receipt is pending. Serial number and a remark are optional.
4. **Delivery and attachment:** enter who delivered, and attach the scan. **Received by (store man)** is the store man of the receiving store: if the store has one, he is filled in; if it has several, choose one. If the store has none, the receipt still goes ahead with no store man named; ask your System Administrator to assign one.
5. Press **Submit for approval**. The button stays off until every required field (*) is filled, and it says so beside it.
6. The Model 19 voucher opens so you can print it.

> One receipt registers one item line, with its quantity. For several different items on one slip, register each as its own receipt with the same Model 19 number.

## Fill in from a Model 19 PDF

If you have the Model 19 as a **PDF saved from IFMIS**, press **Import receipt** at the top right of the receive form and choose it, or attach it in **Delivery and attachment**. It is attached and read, and the form fills in what is still empty; anything you already typed is kept. A note under the attachment lists what was filled. **Check every filled field against the paper** before submitting; nothing is submitted for you.

- **Check against the copy:** press **View** beside the attachment to open it over the form, before anything is saved. Every form's attachment has **View**.
- **What is filled:** Model 19 No., PO number, received date, transaction type, source, buyer and program, and the first item: description, category, unit of measure, quantity, unit price and the **item code** a consumable is known by. A fixed asset's tag number isn't on the Model 19, so type it.
- **Only a Model 19 is read here.** A Model 21 transfer form is not: the note says to read it from the transfer form of the asset. Any other PDF fills nothing.
- **Only PDFs saved from IFMIS are read.** A scanned PDF or a photo has no text in it: it is attached as the scanned copy, and you fill in the fields as usual.
- **Already received?** If the slip's item was already received on the same Model 19 No., the note says so with its item code, so the goods are not counted twice.
- **A slip with several items:** the first fills the form and the others are listed under it, in **Other items on this slip**. Set each one's **item type** and **condition** (the PDF doesn't say them), or press **Use the first item's type and condition**; remove any line you don't want to register. One **Submit** registers every line, each as its own record (its own row in Assets) with the same voucher details, and each waits for approval.

## Correct a mistake

Until the Team Leader has endorsed it, open the receipt and choose **Edit receipt**, change what is wrong, and press **Save changes**. Every change is recorded. After the Team Leader endorses it, editing is locked: ask an approver to reject it, then register it again.

## After approval

The asset becomes **In store** and can be issued. If it is **rejected**, it stays on record as **Rejected** with the reason, and you can register it again.

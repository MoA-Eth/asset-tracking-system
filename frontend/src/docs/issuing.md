# Issuing items (Model 22)

Use this to hand items from the store to a staff member, or to an outside organization. The items stay in store until the request is approved at both stages.

## Before you begin

- [ ] You have the Model 22, best as the **PDF saved from IFMIS** (it fills in the form for you), or the paper slip.
- [ ] You know who receives the items.
- [ ] The **signed copy**: the IFMIS printout with its signatures, scanned or photographed. It is required only if your administrator says so.

## The form

It follows the Model 22, top to bottom:

1. **IFMIS Model 22 PDF:** the PDF saved from IFMIS, read to fill in the form.
2. **Voucher:** Model 22 No., issued date, transaction type.
3. **Items:** one row per line on the slip: the store item, unit, what is in store, quantity, unit price and total, then the transport cost and grand total.
4. **Recipient and signatures:** who receives the items, the store man who issues them, and the **Signed copy**.

The bar at the bottom stays in view with **Submit**; click a name under **Still needed** to jump to that field.

## Issue items

1. On **Assets**, open the **⋮** menu of an **In store** asset and choose **Issue (Model 22)**. The form starts with that asset in its first row.
2. Attach the Model 22 PDF (see below), or fill in by hand.
3. **Voucher:** enter the **Model 22 No.**, the **Issued date** and the **Transaction type** (Move Order Issue, Miscellaneous issue, Subinventory Transfer, Direct Store Issue, Department Assignment, or Project Allocation).
4. **Items:** for each row choose the **store item** (type a name, record code or IFMIS item code) and the **quantity**, a whole number up to what is in store. You can issue **part** of a batch: those units get their own record and the rest stays in store. Unit and unit price are the item's, as received on Model 19.
   - **Add item** adds a row for another line of the same Model 22; **×** at the end of a row removes it.
   - All rows must come from **one store**. Each row becomes its own request.
   - Enter the **Transport cost** under the table if the slip has one.
5. **Recipient and signatures:** in **Received by**, pick who receives the items. The list has both **employees** and **organizations**; type a name, employee ID or an organization's short name to find one.
   - **An employee:** their **directorate** fills in; change it if needed.
   - **An organization:** its usual **Contact person** fills in; change it if someone else signs.
   - **An organization that is not in the list:** type its full name and choose **Add "…" as an organization**. It is added to the list (Settings → Organizations), so it is spelled the same next time.
6. **Issued by (store man)** is the store man of the items' store; choose one if there are several. Attach the **Signed copy**.
7. Press **Submit for approval** (or **Submit 3 items for approval**). The Model 22 voucher opens for printing.

## Fill in from a Model 22 PDF

Choose it in **IFMIS Model 22 PDF** at the top. The form fills in and a note lists what was filled. **Check it against the paper** before submitting: the PDF is shown open in **Slip preview** at the bottom of the form.

- **Filled in:** Model 22 No., issued date, transaction type, transport cost, and **every line as a row**, matched to the store item with the same **IFMIS item code** and enough in store. **Received by** picks the employee named on the slip, or the organization when the name is one in the list; a name that is neither is offered to add as an organization. **Issued by** picks the store man.
- **The same item code on several lines** (for example five umbrella lines) becomes **one row** with the total quantity, because one store item is issued in one request.
- **A line not in store under its code** is marked in red: choose the store item yourself, or remove the row.
- **A PDF with several vouchers:** only the first is read, and the note says so.
- **The signed scan is never read.** A scan or photo chosen in the IFMIS PDF box is moved to **Signed copy**. A Model 19, Model 21 or disposal form is refused here.

## Common cases

| Case | What to do |
|---|---|
| One item | Issue it from its **⋮** menu: one row. Submit. |
| Several items on one Model 22 | Open the issue from any of them and attach the PDF: every line becomes a row. Or add rows by hand. |
| Items in different stores | One Model 22 per store. |
| A slip line not in store | It is marked red: pick the item, or remove the row. |
| An outside organization receives it | Pick it in **Received by**, or add it there if it is new. |
| Writing units off | Transaction type **Disposal** (below). |
| A mistake after submitting | Until the Team Leader endorses it: **Edit issue**, fix, **Save changes**. After that it is locked. |

## Dispose of stock through Model 22

Some units are written off on a Model 22 instead of the disposal form (expired, damaged, used up). Open **Issue (Model 22)** as usual and tick **Disposal (write-off)** beside the **Voucher** heading:

- **Received by** goes away: enter the **Reason for disposal** instead. The section is then called **Reason and signatures**.
- Everything else is the same: Model 22 No., date, items and quantities (several rows too), **Issued by (store man)**, the PDF and the signed copy. The button says **Submit disposal for approval**.
- Untick it to go back to an issue, with the transaction type you had.
- It goes through the same two approvals. When approved, the units leave the register as **Disposed**; a partial quantity splits off its own record. On the approvals page it shows as **Model 22 (DISPOSAL)**, and on the asset as **Disposal pending**.
- **The voucher prints as a disposal:** "Articles Or Property Disposed Of (Write-off)", with the disposal date, the reason for disposal, and **Disposed By** (no Received By).

Use the **Dispose** action instead when you need the Fixed Asset Disposal Form, for example to record who the items were sold or given to.

## After submitting

- The asset shows **Issue pending**, with **With Team Leader** or **With Dept. Head**.
- Until the Team Leader endorses it, choose **Edit issue** to correct the recipient, quantity or slip. After that it is locked.
- **Approved:** the asset becomes **Issued** to the recipient. **Rejected:** it stays in store, and the reason shows on the asset.

## The printed Model 22

Same layout as the IFMIS voucher: Model 22 No., Issued Date, Transaction Type and Destination; the **Item** column shows the IFMIS item code; then Total, Transportation Cost and Grand Total, and Issued By / Received By.

> Items issued to an outside organization stay with it: they are not returned or transferred through the system.

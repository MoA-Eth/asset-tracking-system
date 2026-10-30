# Receiving items (Model 19)

Use this when new items arrive. A receipt creates the asset records. They stay **Receipt pending** until the Team Leader endorses them and the Department Head approves them.

## Before you begin

- [ ] You have the Model 19, best as the **PDF saved from IFMIS** (it fills in the form for you), or the paper slip.
- [ ] You know which store the items go to.
- [ ] The **signed copy**: the IFMIS printout with its signatures, scanned or photographed (PDF, PNG, JPEG or WEBP, up to 10 MB). It is required only if your administrator says so.

## The form

It follows the Model 19, top to bottom:

1. **IFMIS Model 19 PDF:** the PDF saved from IFMIS, read to fill in the form.
2. **Voucher:** Model 19 No., PO number, received date, transaction type, then source, buyer and program.
3. **Items:** one row per line on the slip, with each row's total and the grand total.
4. **Store and signatures:** receiving store, received by (store man), delivered by, and the **Signed copy** (the signed printout, scanned).

The bar at the bottom stays in view with **Submit**. While something is missing it lists it under **Still needed**: click a name to jump to that field.

## Register a receipt

1. On **Assets**, press **Receive items (Model 19)**.
2. Attach the Model 19 PDF (see below), or fill in by hand.
3. **Voucher:** enter the Model 19 No., received date and transaction type. **The PO number decides purchase or donation**, as on the IFMIS slip:
   - **With a PO number: a purchase.** Enter the **Source** (supplier). Buyer and program are optional.
   - **Donation:** Enter the **Donor / Sponsoring organization**. The IFMIS code is optional for donations. Price fields (unit price, charges, and total) are available and recorded like a normal PO receipt.
4. **Items:** for each row enter the **IFMIS item code** (optional for donations), description, category, unit, quantity and, for a purchase, unit price.
   - The code's first digit says what it is: **1 is a Consumable**, **0 is a Fixed asset**. Nobody picks it.
   - A **fixed asset is one item**: its quantity is 1.
   - **Add item** adds a row for another line of the same Model 19; **×** at the end of a row removes it.
   - The system gives every item its own record code.
5. **Store and signatures:** choose the **Receiving store** (yours is chosen if you are the store man of one). **Received by** is that store's store man; choose one if there are several. **Delivered by** follows the buyer until you type another name. Attach the **Signed copy**: it is kept as the receipt's copy. Until you add one, the IFMIS PDF is kept instead.
6. Press **Submit for approval**. The Model 19 voucher opens to print.

## Fill in from a Model 19 PDF

Choose it in **IFMIS Model 19 PDF** at the top. The form fills in what is still empty and keeps what you typed; a note lists what was filled. **Check it against the paper** before submitting: the PDF is shown open in **Slip preview** at the bottom of the form, so you can compare without opening anything. With a signed copy attached too, switch between them there; **Hide** puts it away.

- **Filled in:** the voucher header, **every item line as a row** (code, type, description, category, unit, quantity, price), delivered by, and received by when IFMIS printed the names. A store man named on the slip also sets the store.
- **Another PDF** replaces what the first one filled in, including its rows; what you typed stays.
- **A scan or photo chosen in the IFMIS PDF box is read with OCR** (it takes up to a minute). The header (Model 19 No., PO, date, source, buyer, program) is filled in; item lines are filled only where quantity × unit price matches the line total, and the rest are added by hand. Handwritten names are not read. The scan becomes the receipt's copy. **Check every value against the paper.**
- **The signed scan under Signed copy is never read.** Attaching it changes nothing that was filled in.

## Common cases

| Case | What to do |
|---|---|
| One item on the slip | One row. Submit. |
| Several items on one Model 19 | One receipt, one row per line (the PDF adds them). Each row becomes its own record and its own approval; the Approvals page can select them all. |
| Several of the same fixed asset (e.g. 5 laptops on one line) | A fixed asset is one item: add one row per laptop (quantity 1 each). |
| Items on **different** Model 19s | One receipt per Model 19. Submit this one, then press **Receive items** again. |
| An item that is **not** on this Model 19 | Don't add it here: it would be saved under this slip's number. Register it with its own Model 19. |
| No Model 19 yet | It can't be registered yet: the Model 19 No. is required. |
| Donation | Select 'Donation / Grant Receipt'. Enter donor organization, and fill item price fields like a normal PO receipt. |
| Petty-cash purchase (no PO number on the slip) | Select transaction type. Prices and details are filled in as normal. |
| Usual flow: IFMIS PDF, then the signed printout | Choose the IFMIS PDF at the top (it fills the form), then attach the signed scan under **Signed copy**. |
| Only a scan or photo, no IFMIS PDF | Choose it in the IFMIS PDF box: it is read with OCR and kept as the copy. Check every value against the paper, and add the items it could not read. |
| A Model 21, Model 22 or disposal form | Refused here and not attached; the note says which form it belongs to. |
| The slip was already received | Duplicate entrance is not permitted: the note warns with the existing record codes and submission is blocked so the goods aren't counted twice. |
| A mistake after submitting | Until the Team Leader endorses it: **Edit receipt**, fix, **Save changes**. After that, the Department Head can correct it (Edit receipt, or **Correct** in Approvals) or reject it. Every correction is recorded in its history. |
| Rejected | It stays on record as **Rejected** with the reason; register it again. |

## After approval

The assets become **In store** and can be issued.

## The printed Model 19

Same header as the IFMIS slip: Model 19 No., PO Number, Received Date, Transaction Type, Source, Buyer. On a donation, PO Number and Buyer are printed empty; unit price, total amount, and grand total are printed. All rows of the receipt print on one voucher.

# Receiving items (Model 19)

Use this when new items arrive. A receipt creates the asset records. They stay **Receipt pending** until the Team Leader endorses them and the Department Head approves them.

## Before you begin

- [ ] You have the Model 19, best as the **PDF saved from IFMIS** (it fills in the form for you), or the paper slip.
- [ ] You know which store the items go to.
- [ ] If your administrator requires scanned slips, you have the scan (PDF, PNG, JPEG or WEBP, up to 10 MB).

## The form

It follows the Model 19, top to bottom:

1. **Model 19 voucher:** attach the PDF or scan here.
2. **Voucher:** Model 19 No., PO number, received date, transaction type, then source, buyer and program.
3. **Items:** one row per line on the slip, with each row's total and the grand total.
4. **Store and signatures:** receiving store, received by (store man), delivered by.

The bar at the bottom stays in view with **Submit**. While something is missing it lists it under **Still needed**: click a name to jump to that field.

## Register a receipt

1. On **Assets**, press **Receive items (Model 19)**.
2. Attach the Model 19 PDF (see below), or fill in by hand.
3. **Voucher:** enter the Model 19 No., received date and transaction type. **The PO number decides purchase or donation**, as on the IFMIS slip:
   - **With a PO number: a purchase.** Enter the **Source** (supplier). Buyer and program are optional.
   - **No PO number: a donation.** Source, buyer and the price columns are hidden; prices are saved as 0.
4. **Items:** for each row enter the **IFMIS item code**, description, category, unit, quantity and, for a purchase, unit price.
   - The code's first digit says what it is: **1 is a Consumable**, **0 is a Fixed asset**. Nobody picks it.
   - A **fixed asset is one item**: its quantity is 1.
   - **Add item** adds a row for another line of the same Model 19; **×** at the end of a row removes it.
   - The system gives every item its own record code.
5. **Store and signatures:** choose the **Receiving store** (yours is chosen if you are the store man of one). **Received by** is that store's store man; choose one if there are several. **Delivered by** follows the buyer until you type another name.
6. Press **Submit for approval**. The Model 19 voucher opens to print.

## Fill in from a Model 19 PDF

Attach it in **Model 19 voucher**, or press **Import receipt** at the top right. The form fills in what is still empty and keeps what you typed; a note lists what was filled. **Check it against the paper** (press **View** to open the copy) before submitting.

- **Filled in:** the voucher header, **every item line as a row** (code, type, description, category, unit, quantity, price), delivered by, and received by when IFMIS printed the names. A store man named on the slip also sets the store.
- **Another PDF** replaces what the first one filled in, including its rows; what you typed stays.

## Common cases

| Case | What to do |
|---|---|
| One item on the slip | One row. Submit. |
| Several items on one Model 19 | One receipt, one row per line (the PDF adds them). Each row becomes its own record and its own approval; the Approvals page can select them all. |
| Several of the same fixed asset (e.g. 5 laptops on one line) | A fixed asset is one item: add one row per laptop (quantity 1 each). |
| Items on **different** Model 19s | One receipt per Model 19. Submit this one, then press **Receive items** again. |
| An item that is **not** on this Model 19 | Don't add it here: it would be saved under this slip's number. Register it with its own Model 19. |
| No Model 19 yet | It can't be registered yet: the Model 19 No. is required. |
| Donation | Leave the PO number empty. No source, buyer or prices. |
| Petty-cash purchase (no PO number on the slip) | It comes in as a donation. If it was bought, type the PO number, or ask your supervisor how to record it. |
| A scan or photo, not an IFMIS PDF | It is attached as the copy; fill in the fields by hand. |
| A Model 21, Model 22 or disposal form | Refused here and not attached; the note says which form it belongs to. |
| The slip was already received | The note warns with the existing record codes, so the goods aren't counted twice. |
| A mistake after submitting | Until the Team Leader endorses it: **Edit receipt**, fix, **Save changes**. After that: ask an approver to reject it, then register it again. |
| Rejected | It stays on record as **Rejected** with the reason; register it again. |

## After approval

The assets become **In store** and can be issued.

## The printed Model 19

Same header as the IFMIS slip: Model 19 No., PO Number, Received Date, Transaction Type, Source, Buyer. On a donation, PO Number, Source and Buyer are printed empty, with no prices or grand total. All rows of the receipt print on one voucher.

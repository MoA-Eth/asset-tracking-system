# Transfers (Model 21)

A **transfer** moves a **fixed asset** from one holder to another, hands it from the store to an employee, or **takes it back to a store**. It is one form, **Transfer (Model 21)**: leave **Return to store** empty to transfer to an employee, or choose a store to return the asset there. **Consumable items** are issued (Model 22) and can't be transferred. Nothing changes on the asset until the Department Head approves.

## Transfer an asset

1. On **Assets**, open the **⋮** menu of a fixed asset that is **Issued** or **In store** and choose **Transfer (Model 21)**.
2. Enter the **Model 21 No.** and the **Book**. The **Transfer date** is today; change it if the transfer happened on another day (it can't be in the future).
3. Check the asset. Optionally enter the **accumulated depreciation**.
4. Choose **To employee** (required). The **directorate** fills in from the employee; change it if needed.
5. **Vehicle details** (chassis, plate, engine, accessories, reserve tyre, tire numbers) show for vehicles and machinery, or when the PDF has them; for anything else, press **Add vehicle details**. Note defects under **Defects / remarks**.
6. **Recorded by (store man)** is a store man of the store the asset came from, chosen for you when there is only one. His name is printed on the voucher as **Recorded By**. When the asset is still **In store**, the field reads **Transferred by (store man)** and he is the **Transferor** on the voucher.
7. Attach the **Signed copy** (the IFMIS printout with its signatures, scanned) if you have it. Until it is added, the IFMIS PDF is kept as the copy.
8. Press **Submit transfer for approval**. The Model 21 voucher opens for printing.

## Take an asset back to store

Use the same form for an **Issued** asset that is coming back.

1. Open **Transfer (Model 21)** on the asset and fill in the **Model 21 No.**, the **Book** and the date.
2. In **Return to store**, choose the store it goes back to. **To employee** and **To directorate** disappear.
3. **Received by (store man)** is a store man of that store, chosen for you when there is only one. If the store has none, the transfer still goes ahead with no store man named.
4. Enter the **Reason for return**. Note any defects or missing parts.
5. Attach the **Signed copy** (required only if your administrator says so).
6. Press **Submit transfer to store for approval**.

The printed voucher keeps the IFMIS title, **Fixed Asset Internal Transfer Form**, as IFMIS prints a return on the same form. Under the title it shows **Transaction Type: Return to store** and the **Reason for return**, so the signers can tell it is a return.

## Good to know

- You can **edit** a pending transfer until the Team Leader endorses it. A transfer to store keeps its **Return to store** choice.
- A request on an asset blocks a second one: only one open request per record.
- **Approved transfer to an employee:** the new holder and directorate apply. **Approved transfer to store:** the asset is **In store** and no one holds it. **Rejected:** nothing changes.
- An asset that is already **In store** can only be transferred to an employee; **Return to store** is offered for issued assets.
- Assets issued to an outside organization stay with it: they are not transferred or returned through the system.

## Fill in from a Model 21 PDF

On the transfer form, choose the Model 21 as a **PDF saved from IFMIS** in the **IFMIS Model 21 PDF** box at the top. It fills in the Model 21 No., book, transfer date, the asset (by its tag number), depreciation and book value, the employee it goes to (by employee ID), and for a vehicle the details printed under the table: **chassis number** (even when IFMIS wraps it over several lines), **plate**, **engine**, **accessories** (jack with handle, tire wrench, keys, reserve tyre), **tire numbers** and the **remark**. Check them against the paper before submitting: the PDF is shown open in **Slip preview** at the bottom of the form.

The form keeps the order of operations, so nothing is filled in for an asset that isn't ready to transfer:

- The asset must already be **received on a Model 19 and approved**.
- It must be a **fixed asset**, **issued** to an employee or still **in store**; consumables are issued, not transferred.
- If it is issued, it must be held by the employee the form transfers it **from**.
- It must not have another request waiting for approval.

**An asset IFMIS knows by its own tag:** the form finds an asset by its **IFMIS tag number** first, then by its record code. If the form names a tag no asset has (e.g. MOA-016341 on an asset received here as MOA-VEH-2026-0001), it asks which asset it is: pick it and press **Save as its IFMIS tag**. The tag is kept on the asset, the form is read again, and later forms find it straight away.

**A form with several assets:** the first fills the form and the others are listed under it, each checked the same way and marked **Will be transferred** or **Not transferred** with the reason. One **Submit** transfers the first and every asset that fits, each as its own request, to the same recipient with the same Model 21 No., book and date. Press **Leave out** to skip one.

Only a Model 21 is read here; a Model 19 is sent to **Receive items**. A scanned PDF has no text and can't be read.

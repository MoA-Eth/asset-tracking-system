# Transfers (Model 21)

A **transfer** moves a **fixed asset** from one holder to another, hands it from the store to an employee, or **takes it back to a store**. It is one form, **Transfer (Model 21)**: leave **Return to store** empty to transfer to an employee, or choose a store to return the asset there. **Consumable items** are issued (Model 22) and can't be transferred. Nothing changes on the asset until the Department Head approves.

## Transfer an asset

1. On **Assets**, open the **⋮** menu of a fixed asset that is **Issued** or **In store** and choose **Transfer (Model 21)**.
2. Enter the **Model 21 No.** and the **Book**. The **Transfer date** is today; change it if the transfer happened on another day (it can't be in the future).
3. Check the asset. Optionally enter the **accumulated depreciation** (the **chassis number** is under Vehicle & machinery details).
4. Choose **To employee** (required). The **directorate** fills in from the employee; change it if needed.
5. Vehicles and machinery have optional details: chassis, plate, engine, accessories (jack, wrench, keys), reserve tyre, tires and defects.
6. **Recorded by (store man)** is a store man of the store the asset came from, chosen for you when there is only one. His name is printed on the voucher as **Recorded By**. When the asset is still **In store**, the field reads **Transferred by (store man)** and he is the **Transferor** on the voucher.
7. Press **Submit transfer for approval**. The Model 21 voucher opens for printing.

## Take an asset back to store

Use the same form for an **Issued** asset that is coming back.

1. Open **Transfer (Model 21)** on the asset and fill in the **Model 21 No.**, the **Book** and the date.
2. In **Return to store**, choose the store it goes back to. **To employee** and **To directorate** disappear.
3. **Received by (store man)** is a store man of that store, chosen for you when there is only one. If the store has none, the transfer still goes ahead with no store man named.
4. Choose the **Condition on return** (Good, Fair, Needs repair or Damaged) and enter the **Reason for return**. Note any defects or missing parts.
5. Attach the **scanned return slip** (required only if your administrator says so).
6. Press **Submit transfer to store for approval**.

## Good to know

- You can **edit** a pending transfer until the Team Leader endorses it. A transfer to store keeps its **Return to store** choice.
- A request on an asset blocks a second one: only one open request per record.
- **Approved transfer to an employee:** the new holder and directorate apply. **Approved transfer to store:** the asset is **In store** and no one holds it. **Rejected:** nothing changes.
- An asset that is already **In store** can only be transferred to an employee; **Return to store** is offered for issued assets.
- Assets issued to an outside organization cannot be transferred or returned yet.

## Import many transfers from Excel

Open the transfer form of any asset and press **Import transfers** at the top right and choose the Excel or CSV file. Fill in one row per transfer: Model 21 No., transfer date, book, item code and the employee it goes to (8-digit employee ID) are required. If you fill in **From**, it must be the employee who holds the asset now.

Only **fixed assets** that are **issued** to an employee or still **in store** can be transferred; consumables are issued, not transferred, and assets held by an outside organization are skipped. Choose the file (.xlsx or .csv): every row is checked first and rows with a problem are listed with the reason; nothing is saved until you press **Import**. Each good row becomes its own request and waits for Team Leader endorsement and Department Head approval. An item that already has a request waiting is skipped, so importing the same file again does not duplicate anything. Returns to store are not imported; record them one by one.

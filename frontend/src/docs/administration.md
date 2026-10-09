# Users, employees, stores and settings

These pages are under **Settings**. Only the **System Administrator** can change them; some roles can view them.

## Employees

**Settings → Employees** is the staff register. Everyone in it can hold assets. Having an employee here does **not** let them sign in.

1. **Add employee:** choose or type the **Department**, enter the **Full name (English)** and the **Employee ID** (8 digits, like 00123456). The Amharic name, unit, gender, job title, phone and email are optional. Amharic names accept Ethiopic letters only.
2. **Edit** changes the details; it does not change anyone's sign-in.
3. **Deactivate** removes a person from the issue and transfer forms and signs them out. It is refused while they hold assets or are named on a pending request. **Reactivate** restores them.
4. **Import from Excel:** press **Import from Excel**, then **Download template**. Fill it in (up to 5,000 rows; .xlsx or .csv) and choose the file. A preview shows each row as **New**, **Update**, **No change** or **Skipped** with the reason. Press **Import N employees**. Rows with problems are skipped and the rest are saved; importing a corrected file again does not create duplicates.

## Users (who can sign in)

**Settings → Users** lists the people who can sign in.

1. **Add user:** pick an existing employee, choose a **Role**, and set a **Temporary password** (**Generate** makes one, **Copy** copies it). Give it to the person safely. They must choose their own at the first sign-in.
2. **Change a role:** use the role list on the person's row. It applies at once.
3. **Reset password:** sets a new temporary password. Their old one stops working immediately, and they choose a new one at the next sign-in.
4. **Remove sign-in:** signs the person out and stops them signing in. They stay on the staff list and keep their assets.
5. **Deactivate user:** signs the person out and stops them signing in or receiving assets. Their history is kept. It is refused while they hold assets.

Safeguards: you cannot change your own role, remove your own sign-in or deactivate yourself; the last System Administrator cannot be removed; a directorate can have only one active Team Leader, one Department Head and one Manager.

## Roles

**Settings → Roles** shows what each role may do. Switch a permission on or off, press **Save changes**, and confirm. Every change is recorded in the audit log, and **Reset to defaults** restores a role. Some rules cannot be broken: the administrator cannot work with the stock or approve, and a role that makes requests cannot also approve them.

## Stores

**Settings → Stores** holds the stores and the locations in them (rooms, sections, shelves).

1. **Add store:** a name, the address, and a first location.
2. In a store, **Add location**, **Rename**, **Deactivate** or **Delete** (delete only if never used).
3. You cannot deactivate a store or location that still holds assets or is the destination of a pending request, or the only store that can receive stock.

Receiving needs at least one active store.

## System Settings

**Scanned slip:** choose **Optional** or **Required**. When it is **Required**, a receipt, issue, return or disposal cannot be submitted without a scan of its slip. It saves at once.

## Password help

Staff who forget their password ask you for a reset. There is no self-service reset. Use **Reset password** on their row, and give them the new temporary password.

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

Safeguards: you cannot change your own role, remove your own sign-in or deactivate yourself; neither the last System Administrator nor the last Super Administrator can be removed; a directorate can have only one active Team Leader, one Department Head and one Manager.

## Roles

**Settings → Roles** shows what each role may do. Switch a permission on or off, press **Save changes**, and confirm. Every change is recorded in the audit log, and **Reset to defaults** restores a role. Some rules cannot be broken: standard System Administrators cannot work with stock or approve requests (strict segregation of duties), and a role that makes requests cannot also approve them. The Super Administrator holds break-glass master clearance across all areas.

## Stores

**Settings → Stores** holds the stores and the locations in them (rooms, sections, shelves).

1. **Add store:** a name, the address, and a first location.
2. In a store, **Add location**, **Rename**, **Deactivate** or **Delete** (delete only if never used).
3. You cannot deactivate a store or location that still holds assets or is the destination of a pending request, or the only store that can receive stock.

## Store men

Each store has **store men**: the employees who keep it. They need no sign-in. Their names appear in that store's dropdowns and on its vouchers: **Received by** on a receipt, **Issued by** on an issue, the **storekeeper** on a disposal form, and the person who takes an item back on a return.

1. On **Settings → Stores**, find the store. The **Store men** line sits under its name.
2. Pick an employee in **Add a store man** to add one, or press the **x** beside a name to remove one. It saves at once and is recorded in the audit log.
3. A store can have several. With one, the system uses him automatically; with several, the person making the request chooses.

> **A store that has store men always names one** on its vouchers. A store with **none** keeps working, but its vouchers name no store man. The Dashboard and this page list such stores until each has one, so assign a store man to every store.

Receiving needs at least one active store.

## System Settings

- **Scanned slip field in forms (የተቃኘ ሰነድ መስክ):** Choose **Off (Single Uploader)** or **On (Separate Field)**. When set to **Off**, all asset forms (Model 19, 22, 21, and Disposal) feature only one file uploader for the IFMIS PDF, which performs both automated form autofill and slip attachment in a single action. When set to **On**, forms display a second "Signed copy" field for scanned paper copies.
- **Slip attachment policy (የሰነድ አባሪ ግዴታ):** Choose **Optional** or **Required**. When set to **Required**, a receipt, issue, return or disposal cannot be submitted without an attached slip. Changes apply immediately and are recorded in the audit trail.

## Password help

Staff who forget their password have two options:
1. **Self-service reset:** On the sign-in portal, staff can click "Forgot or need to change password?" and enter their Payroll ID and matching email address.
2. **Administrator reset:** In **Settings → Users**, click **Reset password** on the employee's row to issue a new temporary password that must be changed on first login.

## API documentation and system diagnostics

The ATS platform includes built-in OpenAPI 3.0 documentation and monitoring endpoints:
- **API Portal (Swagger UI):** `http://<server-address>:3000/api/docs`
- **OpenAPI 3.0 JSON specification:** `http://<server-address>:3000/api/docs/json`
- **Liveness probe:** `http://<server-address>:3000/api/health/live`
- **Readiness probe:** `http://<server-address>:3000/api/health/ready`
- **Combined health status:** `http://<server-address>:3000/api/health`

## Organizations

**Settings → Organizations** lists the outside organizations items are issued to (regional bureaus, institutes, projects, NGOs). Each is listed once, so its name is spelled the same on every Model 22 and its items can be found together.

- **Add** an organization with its full name, a **short name** (also found when searching, e.g. Oromia BoA) and its **usual contact person**, who is offered as the person who signs. Encoders can also add one from the issue form when it is missing.
- **Edit** fixes a name or contact; past issues keep the name they were made with.
- **Deactivate** an organization that no longer receives items: it is no longer offered on the issue form, and past records keep its name. **Reactivate** brings it back.
- Organizations typed on issues before this list existed were added to it automatically, once each.

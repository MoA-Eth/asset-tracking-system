# Page implementation inventory

Reviewed against `SPECIFICATION.md`, the README, and the user-approved [role access map](ROLE_ACCESS.md) on September 30, 2026. Page construction remains limited to one new page per request.

| Page / navigation entry | Current implementation | Requirement reference |
| --- | --- | --- |
| Dashboard | Dedicated executive dashboard | Specification §3 |
| Stock-In | Dedicated registration and inventory page | Specification §2.1; README Model 19 |
| Stock-Out | Dedicated issue registration page | Specification §2.2; README Model 20 |
| Asset Transfer / Returns | Dedicated transfer page with a Model 22 return workflow | Specification §2.3; README Model 22 |
| Approvals | Dedicated two-stage approval queue | README approval sequence and role matrix |
| Reports | Dedicated inventory reports and exports | Specification §3 |
| Audit Log | Dedicated searchable audit page | Specification §5 |
| Users / Employees | Existing shared staff list has explicit Employees and User Accounts views. Encoders/heads see a read-only directory; administrators retain role editing. Account creation/deactivation and full employee CRUD remain incomplete. | README System Administrator responsibilities |
| Roles / approval matrix | Dedicated page missing; hidden until built, with administrator-only permission reserved | README roles, approval tiers, and segregation of duties |
| Departments | Dedicated read-only directorate registry and asset allocation page; administrator CRUD remains unbuilt | Specification §3 directorate allocation |
| Locations | **Built:** searchable site/building/room registry, linked assets and valuations, administrator create/edit/delete with audit history, read-only encoder/head access | Specification §2.1 and §2.3 location references; approved access map |
| Stores | **Built:** existing Stores entry now shows designated locations, available stock/value, pending movements, issued assets, and inventory details. Administrator designation/detail management uses the existing Locations API. | Specification store-level scope; approved Stores sidebar entry |
| System settings | Existing attachment-policy controls have their own administrator-only navigation destination. Settings are browser-local; central server persistence/enforcement remains unbuilt. | README system settings |
| Department settings | Dedicated department-scoped settings page missing; hidden until built. Department heads cannot change global policy. | Approved role access map |

## Departments page

- Open **Reference Data → Departments** on desktop, or **Departments** in mobile navigation (under **More** when present).
- Available to the System Administrator, Department Head, Data Encoder, and Manager under the approved map.
- Read-only registry with bilingual department names, head records, staff counts and a staff directory.
- Live asset allocations, issued counts, and recorded ETB valuations from the existing APIs.
- Search by name, code, or head; filter by allocation or missing head; sort by name, asset count, or value.
- Open a department for searchable asset details, status, custodian, store, and IFMIS reference.
- Disposed assets are excluded from active totals. Unallocated assets and assets referencing missing departments are reported separately. Pending issues retain their actual status.
- Loading, retry, empty results, and refresh failure states are implemented. A failed refresh preserves the last loaded registry and labels it as such.

## Locations page

- Open **Reference Data → Locations** on desktop, or **More → Reference Data → Locations** on mobile.
- System Administrators can create and edit sites, buildings, rooms, and the central-store designation. Encoders and Department Heads can view; Managers and Team Leaders have no Locations page access.
- Search by site, building, room, or ID; filter central stores/other locations; sort by site, active asset count, or recorded value.
- Counts and ETB totals use active linked assets, excluding disposed assets. Available stock is counted separately from assigned/pending assets. Unknown location references are flagged and excluded from location totals.
- Open a location for its linked asset register, including disposed records, statuses, custodians, IFMIS references, and asset search.
- Administrator changes persist through authenticated API endpoints. Site/building/room combinations are checked for duplicates without case sensitivity. Serializable transactions protect concurrent edits and duplicate creation.
- An unused location can be deleted after confirmation. Any linked asset record, including a disposed one, prevents deletion in both the UI and API. Audit history is retained.
- All create/edit/delete operations and their audit entries commit together. Load retries, stale-data warnings, empty states, and preservation of form inputs after save errors are implemented.

## Stores page

- Completes the existing **Reference Data → Stores** entry (`settings-stores`) from the approved sidebar. No additional page categories or store data model are introduced.
- Available on desktop and under **More → Reference Data → Stores** on mobile. Encoders and Department Heads can view; System Administrators can manage. Manager and Team Leader access stays excluded.
- Uses existing locations marked `isCentralStore`, including headquarters and research-center stores. Other locations are not counted as stores.
- Shows available assets and their recorded ETB value, pending inbound receipts/returns, pending outbound issues, and issued assets. Pending, issued, repair, transfer, and disposed records are excluded from available-stock totals.
- Search by site/building/room/ID; filter by stock availability or pending review; sort by name, available asset count, or available stock value.
- Open a store for linked inventory, search by tag/name/serial/custodian/IFMIS slip, and filter by status. Disposed history is available through the status filter. Available stock at non-store locations and unknown location references are flagged separately.
- Administrators can designate an existing location as a store, edit its existing details, or confirm removal of the store designation. Removing the designation retains the location and all linked assets; it only excludes that location from store totals. These actions use the existing administrator-only, audited location-update API.
- When a location must first be registered, the page links to the already-built Locations page. There are no new store-creation routes, database tables, or schema changes.
- Load/retry/stale-data states and save failures preserve the last data or entered values. Desktop/mobile navigation and role restrictions are covered by component tests.

The current request completes only the previously listed **Stores** page. Departments and Locations were completed in earlier requests. Roles & Approval Matrix, Department Settings, and remaining account/registry management work remain in the existing inventory for later requests.

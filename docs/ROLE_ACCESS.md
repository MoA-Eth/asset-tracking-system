# Approved role and navigation map

Approved by the user on September 30, 2026. This resolves the difference between the specification's high-level management/director roles and the README's five-role, two-stage workflow. It preserves the five roles and the two approval stages, and grants management the read access described in specification §3 and §5.

| Page | Data Encoder | Team Leader | Department Head | Manager | System Administrator |
| --- | --- | --- | --- | --- | --- |
| Dashboard | — | — | View | View | View |
| Stock-In / Model 19 | Register | — | — | — | — |
| Stock-Out / Model 20 | Submit issue | — | — | — | — |
| Asset Transfer / Model 22 | Initiate | — | — | — | — |
| Approvals | — | Stage 1: endorse/reject | Stage 2: approve/reject | — | — |
| Reports | — | View/export | View/export | View/export | View/export |
| Audit Log | — | View | View | View | View |
| Employees | View | — | View | — | Manage |
| Departments | View | — | View | View allocations | Manage |
| Locations | View | — | View | — | Manage |
| Stores | View | — | View | — | Manage |
| User Accounts | — | — | — | — | Manage |
| Roles & Approval Matrix | — | — | — | — | Manage |
| System Settings | — | — | — | — | Manage |
| Department Settings | — | — | Department options only | — | Manage |

“—” means hidden and inaccessible. Management rights are the approved target; page availability and currently implemented actions are recorded in [PAGE_STATUS.md](PAGE_STATUS.md). Registry edit rights were an approved interpretation of administrator responsibility, not an existing complete CRUD implementation.

## Navigation

- **Operations:** Stock-In, Stock-Out, Asset Transfer.
- **Oversight:** Dashboard, Approvals, Reports, Audit Log.
- **Reference Data:** Employees, Departments, Locations, Stores.
- **Administration:** User Accounts, Roles & Approval Matrix, System Settings, Department Settings.

Both desktop and mobile use `frontend/src/utils/navigation.ts`. Empty groups and unbuilt pages are omitted. Mobile provides a **More** menu when more than four pages are available; every permitted built page remains reachable. Stored or programmatically requested tabs are validated before rendering.

Default landing pages remain Stock-In for encoders, Approvals for team leaders and department heads, and Dashboard for managers and administrators.

## API permissions

- Item, movement, approval, audit, and reference APIs require a session. Only encoders submit stock-in, stock-out, transfers, and returns.
- Dashboard reads allow department heads, managers, and administrators. Audit reads also allow team leaders.
- Only team leaders and department heads can act on approvals. The server verifies the current stage and reviewer role for rejection as well as endorsement/approval.
- Encoders can read their own submissions to track Stock-Out status. This does not grant access to the Approvals page or review actions.
- Only administrators can change employee authorization roles. The role change and audit event are saved in one database transaction.
- Only administrators can create, edit, or delete locations. Changes and audit entries commit together; locations with linked assets (including disposed records) cannot be deleted. Encoders and department heads have read-only Locations page access.
- The Stores page uses that same location API for administrator designation/detail changes. Removing a store designation clears `isCentralStore` and retains the location and assets. Encoders and department heads can view the existing Stores entry.
- Authenticated reference and inventory lookups remain available to support the permitted reports, approvals, allocations, and movement pages. Access to a lookup API does not imply access to a standalone registry management page.

The existing authentication service still uses demo credentials/persona login and unsigned demo tokens; these role checks do not replace production authentication. Existing attachment-policy settings remain browser-local, rather than a centrally enforced server policy.

## Database update

Run `npm run db:push` when applying this change to an existing database. Audit subjects can now be employees as well as assets: the incorrect item-only foreign key on `audit_logs.entityId` is removed and `EMPLOYEE` is added to the audit entity types. Existing audit records are retained. This allows administrator role changes to produce correct audit entries without leaving partially saved changes.

The Locations page additionally introduces the `LOCATION` audit entity type. Apply it with the same `npm run db:push` command before using location management; no database reset or reseeding is needed.

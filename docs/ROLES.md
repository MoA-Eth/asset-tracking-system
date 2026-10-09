# Roles and permissions

Settings → Roles is available to System Administrators. It lists the six built-in
roles, live member counts, action permissions, approval responsibilities, and
assigned users. “Manage assignments” opens Users with that role selected.
Role definitions are fixed; creating custom roles or editing permissions is not
part of this release. Other existing Settings sections retain their previous access.

`backend/src/security/role-policy.ts` is the authoritative access policy. Login and
`GET /api/auth/me` return effective permissions, allowed tabs, and a landing tab.
Desktop navigation, mobile settings links, and page selection consume those tabs.
The backend independently enforces action permissions on every protected route.

- Data Encoder records stock movements and requests transfers, returns and disposals (permission "Request disposals", `disposals.write`). Like the other request permissions, it can't be combined with endorsing or authorizing.
- Team Leader endorses or rejects Stage 1.
- Department Head authorizes or rejects Stage 2.
- Manager reads dashboard and reports.
- Employee signs in to see only the assets assigned to them (permission "View the assets assigned to me", `assets.own`). Its one page, **My assets**, lists what is issued to the signed-in person: item, serial number, quantity, condition, when and on which slip it was assigned, and whether a transfer or return of it is waiting. It shows no costs, notes or other people's names. The server takes the person from the session (`GET /api/items/mine`), and the role has none of the staff-wide permissions, so the asset register, requests, approvals, reports, audit log and employee directory all refuse it. Giving everyone an account is a separate step; for now an administrator assigns the role to a person in Settings → Users.
- System Administrator reads the role directory and assigns user roles, without
  store-operation or approval authority.

An employee has one role. Role assignment is restricted to administrators and
cannot remove the last administrator. A serializable transaction writes both the
assignment and its audit record, retrying concurrency conflicts at most three times.
The audit records the authenticated actor, target employee, old/new roles, and both
calendar dates. `USER` audit targets are employee IDs; existing asset audit records
are preserved. The generic audit target no longer has an Item-only foreign key.

## Upgrade an existing database

This repository uses `prisma db push` and has no baseline migration history. Do not
use `migrate deploy` on this database as though a baseline already exists. From
`backend`, apply the explicit, repeatable upgrade without reseeding:

```sh
npm run db:upgrade:roles
```

The command applies `prisma/migrations/202610010001_roles_audit/migration.sql` and
regenerates the Prisma client. It adds the USER enum value and audit lookup index,
removes the incorrect Item-only audit constraint and default plaintext password,
and preserves existing rows. New empty installations can use the existing db setup.

## Sessions

Sign in again after upgrading: old unsigned Base64 tokens are rejected. Sessions
are HMAC-signed and expire after eight hours. Every request loads the employee's
current role from the database. Open clients refresh their session on focus, on
permission denial, and every 30 seconds while visible. Self-reassignment triggers
an immediate refresh, and tabs that are no longer permitted close automatically.

Passwords are required; passwordless persona login is disabled. Existing plaintext
passwords are upgraded to salted scrypt hashes after successful login. New seed
credentials are hashed. Set `JWT_SECRET` to a unique random value of at least 32
characters in production. Development uses a process-local random key if no valid
key is configured, which invalidates sessions on restart. The old example secret
is not accepted as a signing key.

## Verification

Run `npm test` and `npm run build` from the repository root. Tests cover actual
Express route guards in memory, role assignment validation, last-admin protection,
transaction failures/retries, approval stage restrictions, signed sessions,
password verification, navigation, and directory interactions. API route tests do
not require a listening port or a database. Existing end-to-end scripts mutate
inventory and should only run against a disposable test database.

Implementation references: [Node.js crypto](https://nodejs.org/download/release/v22.12.0/docs/api/crypto.html)
and [Prisma serializable transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

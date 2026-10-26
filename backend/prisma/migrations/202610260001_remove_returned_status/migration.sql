-- Migrate legacy RETURNED approval status to REJECTED before dropping the enum value
UPDATE "transaction_approvals" SET "status" = 'REJECTED' WHERE "status"::text = 'RETURNED';

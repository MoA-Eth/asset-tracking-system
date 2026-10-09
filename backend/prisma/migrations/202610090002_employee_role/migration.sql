-- A role for ordinary employees: they sign in only to see the assets assigned to them
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EMPLOYEE';

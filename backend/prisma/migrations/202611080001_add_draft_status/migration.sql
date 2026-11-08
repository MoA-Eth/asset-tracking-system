-- Add DRAFT value to ItemStatus and ApprovalStatus enums
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'DRAFT';


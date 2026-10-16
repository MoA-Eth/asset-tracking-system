-- Chief Director: Authorizes high-value requests (> 10,000,000 ETB)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CHIEF_DIRECTOR';

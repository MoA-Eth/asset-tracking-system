import { describe, expect, it, vi } from 'vitest';
import { requireRole } from './auth.middleware';
import { UserRole } from '../types/asset-management';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error';

describe('auth.middleware - requireRole & Segregation of Duties (SOD)', () => {
  it('throws UnauthorizedError when req.user is undefined', () => {
    const middleware = requireRole(UserRole.TEAM_LEADER);
    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    expect(() => middleware(req, res, next)).toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has an allowed role', () => {
    const middleware = requireRole(UserRole.TEAM_LEADER, UserRole.DEPARTMENT_HEAD);
    const req: any = {
      user: {
        id: 'emp-1',
        role: UserRole.TEAM_LEADER,
        fullNameEn: 'Abebe Bikila',
      },
    };
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe('Segregation of Duties (SOD) Invariants', () => {
    it('blocks DATA_ENCODER from granting Stage 1 or Stage 2 approvals', () => {
      const approvalMiddleware = requireRole(UserRole.TEAM_LEADER, UserRole.DEPARTMENT_HEAD);
      const req: any = {
        user: { id: 'encoder-1', role: UserRole.DATA_ENCODER },
      };
      const res: any = {};
      const next = vi.fn();

      expect(() => approvalMiddleware(req, res, next)).toThrow(ForbiddenError);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks SYSTEM_ADMIN from executing operational store transactions', () => {
      const storeInMiddleware = requireRole(UserRole.DATA_ENCODER);
      const req: any = {
        user: { id: 'admin-1', role: UserRole.SYSTEM_ADMIN },
      };
      const res: any = {};
      const next = vi.fn();

      expect(() => storeInMiddleware(req, res, next)).toThrow(ForbiddenError);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks TEAM_LEADER from executing Stage 2 final approvals', () => {
      const stage2Middleware = requireRole(UserRole.DEPARTMENT_HEAD);
      const req: any = {
        user: { id: 'lead-1', role: UserRole.TEAM_LEADER },
      };
      const res: any = {};
      const next = vi.fn();

      expect(() => stage2Middleware(req, res, next)).toThrow(ForbiddenError);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks DEPARTMENT_HEAD from executing Stage 1 endorsements', () => {
      const stage1Middleware = requireRole(UserRole.TEAM_LEADER);
      const req: any = {
        user: { id: 'head-1', role: UserRole.DEPARTMENT_HEAD },
      };
      const res: any = {};
      const next = vi.fn();

      expect(() => stage1Middleware(req, res, next)).toThrow(ForbiddenError);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

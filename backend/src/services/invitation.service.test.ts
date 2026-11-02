import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  generateOpaqueToken,
  hashInvitationToken,
  inviteUser,
  verifyInvitationToken,
  acceptInvitationAndSetPassword,
} from './invitation.service';
import * as emailService from './email.service';
import { UserRole } from '../types/asset-management';

vi.mock('../lib/prisma', () => ({
  prisma: {
    employee: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    userInvitationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('./email.service', () => ({
  deliverUserInvitation: vi.fn(),
}));

const db: any = prisma;
let people: Record<string, any>;
let tokens: Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  people = {
    admin: { id: 'admin', payrollId: 'ADM-1', fullNameEn: 'Admin User', role: UserRole.SYSTEM_ADMIN, isActive: true },
    encoder: { id: 'encoder', payrollId: 'ENC-1', fullNameEn: 'Encoder User', role: UserRole.DATA_ENCODER, isActive: true },
    'cand-1': { id: 'cand-1', payrollId: '00123456', fullNameEn: 'Abebe Kebede', role: null, isActive: true, email: 'abebe@moa.gov.et' },
    'cand-2': { id: 'cand-2', payrollId: '00123457', fullNameEn: 'Almaz Ayele', role: null, isActive: true, email: null },
    'cand-3': { id: 'cand-3', payrollId: '00123458', fullNameEn: 'Deactivated User', role: null, isActive: false, email: 'deact@moa.gov.et' },
  };
  tokens = {};

  db.$transaction.mockImplementation((fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(({ where }: any) => Promise.resolve(people[where.id] ? { ...people[where.id] } : null));
  db.employee.update.mockImplementation(({ where, data }: any) => {
    people[where.id] = { ...people[where.id], ...data };
    return Promise.resolve({ ...people[where.id] });
  });
  db.userInvitationToken.create.mockImplementation(({ data }: any) => {
    tokens[data.tokenHash] = { id: 'token-1', ...data };
    return Promise.resolve(tokens[data.tokenHash]);
  });
  db.userInvitationToken.findUnique.mockImplementation(({ where }: any) => {
    const t = tokens[where.tokenHash];
    if (!t) return Promise.resolve(null);
    return Promise.resolve({
      ...t,
      employee: people[t.employeeId] ? { ...people[t.employeeId] } : null,
    });
  });
  db.userInvitationToken.deleteMany.mockResolvedValue({ count: 1 } as any);
  db.userInvitationToken.delete.mockResolvedValue({ id: 'token-1' } as any);
  db.auditLog.create.mockResolvedValue({ id: 'audit-1' } as any);
});

describe('User Invitation Service', () => {
  it('generates consistent sha256 token hashes', () => {
    const token = generateOpaqueToken();
    expect(token.raw).toHaveLength(64);
    expect(token.hash).toHaveLength(64);
    expect(hashInvitationToken(token.raw)).toBe(token.hash);
  });

  describe('inviteUser', () => {
    it('creates an invitation token and calls deliverUserInvitation', async () => {
      const result = await inviteUser('cand-1', { role: UserRole.DATA_ENCODER }, 'admin', 'https://asset.moa.gov.et');

      expect(result.employee).toMatchObject({ id: 'cand-1', role: UserRole.DATA_ENCODER });
      expect(result.invitationLink).toContain('https://asset.moa.gov.et/create-password?token=');
      expect(db.userInvitationToken.create).toHaveBeenCalled();
      expect(emailService.deliverUserInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'abebe@moa.gov.et',
          displayName: 'Abebe Kebede',
          role: UserRole.DATA_ENCODER,
        }),
      );
    });

    it('allows updating or supplying an email for an employee with no email', async () => {
      const result = await inviteUser(
        'cand-2',
        { role: UserRole.TEAM_LEADER, email: 'almaz@moa.gov.et' },
        'admin',
        'http://localhost:3000',
      );

      expect(result.employee.email).toBe('almaz@moa.gov.et');
      expect(emailService.deliverUserInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'almaz@moa.gov.et' }),
      );
    });

    it('refuses invitation when non-admin attempts to invite', async () => {
      await expect(
        inviteUser('cand-1', { role: UserRole.DATA_ENCODER }, 'encoder', 'http://localhost:3000'),
      ).rejects.toThrow('Only System Administrators can send user invitations');
    });

    it('refuses invitation for deactivated employees', async () => {
      await expect(
        inviteUser('cand-3', { role: UserRole.DATA_ENCODER }, 'admin', 'http://localhost:3000'),
      ).rejects.toThrow('is deactivated');
    });

    it('refuses invitation without valid role or email', async () => {
      await expect(
        inviteUser('cand-1', { role: 'INVALID_ROLE' }, 'admin', 'http://localhost:3000'),
      ).rejects.toThrow('Choose a valid role');

      await expect(
        inviteUser('cand-2', { role: UserRole.DATA_ENCODER }, 'admin', 'http://localhost:3000'),
      ).rejects.toThrow('An email address is required');
    });
  });

  describe('verifyInvitationToken & acceptInvitationAndSetPassword', () => {
    it('verifies a valid token and sets the permanent password', async () => {
      const { invitationLink } = await inviteUser('cand-1', { role: UserRole.DEPARTMENT_HEAD }, 'admin', 'http://localhost:3000');
      const rawToken = new URL(invitationLink).searchParams.get('token')!;

      const verification = await verifyInvitationToken(rawToken);
      expect(verification.valid).toBe(true);
      expect(verification.employee.fullNameEn).toBe('Abebe Kebede');

      const acceptResult = await acceptInvitationAndSetPassword(rawToken, 'new-Pass-2026');
      expect(acceptResult.success).toBe(true);
      expect(acceptResult.employee.mustChangePassword).toBe(false);

      const updatedData = db.employee.update.mock.calls.find((c: any) => c[0].data?.password)[0].data;
      expect(updatedData.password).toMatch(/^scrypt\$/);
      expect(updatedData.mustChangePassword).toBe(false);
      expect(db.userInvitationToken.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'cand-1' } });
    });

    it('rejects expired invitation tokens', async () => {
      const token = generateOpaqueToken();
      tokens[token.hash] = {
        id: 't-expired',
        employeeId: 'cand-1',
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      };

      await expect(verifyInvitationToken(token.raw)).rejects.toThrow('expired');
      await expect(acceptInvitationAndSetPassword(token.raw, 'ValidPass-123')).rejects.toThrow('expired');
    });

    it('rejects weak passwords when accepting invitation', async () => {
      const { invitationLink } = await inviteUser('cand-1', { role: UserRole.DATA_ENCODER }, 'admin', 'http://localhost:3000');
      const rawToken = new URL(invitationLink).searchParams.get('token')!;

      await expect(acceptInvitationAndSetPassword(rawToken, 'weak')).rejects.toThrow('at least 8 characters');
      await expect(acceptInvitationAndSetPassword(rawToken, 'allletters')).rejects.toThrow('at least one letter and one number');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { UnauthorizedError } from '../errors/app-error';

describe('AuthService unit tests', () => {
  const authService = AuthService.getInstance();

  it('maintains a single shared instance (Singleton pattern)', () => {
    const instanceA = AuthService.getInstance();
    const instanceB = AuthService.getInstance();
    expect(instanceA).toBe(instanceB);
  });

  describe('verifyToken', () => {
    it('throws UnauthorizedError when token is empty or undefined', async () => {
      await expect(authService.verifyToken('')).rejects.toThrow(UnauthorizedError);
      await expect(authService.verifyToken(undefined as any)).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('rejects when token is corrupted or references non-existent user', async () => {
      await expect(authService.verifyToken('not-valid-base64-payload!!!')).rejects.toThrow();
    });
  });
});

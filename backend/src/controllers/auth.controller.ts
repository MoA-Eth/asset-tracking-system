import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { LoginRequest } from '../types/asset-management';
import { BadRequestError } from '../errors/app-error';
import { changeOwnPassword, publicChangeOrResetPassword } from '../services/access.service';

export class AuthController {
  private authService = AuthService.getInstance();

  /**
   * POST /api/auth/login
   * Authenticate with email or employee ID, and password.
   */
  public login = asyncHandler(async (req: Request, res: Response) => {
    const payload: LoginRequest = req.body;

    if (!payload?.usernameOrEmail) {
      throw new BadRequestError('Enter your email or employee ID.');
    }

    const authResult = await this.authService.login(payload, req.ip || 'unknown');
    return sendSuccess(res, authResult, 'Authenticated successfully');
  });

  /**
   * GET /api/auth/me
   * Return currently authenticated user profile from token.
   */
  public getMe = asyncHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, req.user, 'Current user profile retrieved');
  });

  /**
   * POST /api/auth/change-password  { currentPassword, newPassword }
   * A signed-in person replaces their own password (required after a temporary one).
   */
  /**
   * POST /api/auth/reset-password
   * Public password change or reset from login screen.
   */
  public resetOrChangePassword = asyncHandler(async (req: Request, res: Response) => {
    const result = await publicChangeOrResetPassword(req.body);
    return sendSuccess(res, result, 'Password successfully updated');
  });

  public changePassword = asyncHandler(async (req: Request, res: Response) => {
    await changeOwnPassword(req.user!.id, req.body?.currentPassword, req.body?.newPassword);
    return sendSuccess(res, null, 'Password changed');
  });
}

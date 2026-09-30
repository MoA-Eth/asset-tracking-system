import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { LoginRequest } from '../types/asset-management';
import { BadRequestError } from '../errors/app-error';

export class AuthController {
  private authService = AuthService.getInstance();

  /**
   * POST /api/auth/login
   * Authenticate via email, payrollId, or quick persona role selection.
   */
  public login = asyncHandler(async (req: Request, res: Response) => {
    const payload: LoginRequest = req.body;

    if (!payload.usernameOrEmail && !payload.personaRole) {
      throw new BadRequestError('Either username/email or personaRole is required.');
    }

    const authResult = await this.authService.login(payload);
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
   * GET /api/auth/personas
   * Return predefined Ministry role personas for 1-click test login.
   */
  public getPersonas = asyncHandler(async (_req: Request, res: Response) => {
    const personas = await this.authService.getPersonas();
    return sendSuccess(res, personas, 'Personas retrieved');
  });
}

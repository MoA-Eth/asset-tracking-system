import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

// Public auth endpoints
router.post('/login', controller.login);
router.post('/reset-password', controller.resetOrChangePassword);
router.get('/verify-invitation', controller.verifyInvitation);
router.post('/create-password', controller.createPassword);

// Protected session check
router.get('/me', requireAuth, controller.getMe);
router.post('/change-password', requireAuth, controller.changePassword);

export default router;

import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

// Public auth endpoints
router.post('/login', controller.login);

// Protected session check
router.get('/me', requireAuth, controller.getMe);

export default router;

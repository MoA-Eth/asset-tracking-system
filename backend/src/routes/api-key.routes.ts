import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/async-handler';
import { sendSuccess } from '../utils/api-response';
import { ApiKeyScope, createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from '../services/api-key.service';
import { getKpis } from '../services/kpi.service';

/**
 * Lets another system's server in with an API key (X-API-Key header) instead of a person's sign-in. Used only on the
 * routes meant for keys; every other route still needs a signed-in person.
 */
export const requireApiKey = (scope: ApiKeyScope) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    (req as any).apiKey = await verifyApiKey(req.header('x-api-key'), scope);
    next();
  });

/** GET /api/kpis — the app's key figures, numbers only, for a key allowed "kpis.read" */
export const kpiRoutes = Router();
kpiRoutes.get(
  '/',
  requireApiKey('kpis.read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to, storeId, category, itemType } = req.query;
    sendSuccess(res, await getKpis({ from, to, storeId, category, itemType }), 'Key figures');
  }),
);

/** /api/settings/api-keys — administrators create, list and revoke keys */
export const apiKeyAdminRoutes = Router();
apiKeyAdminRoutes.use(requireAuth, requirePermission('roles.assign'));
apiKeyAdminRoutes.get('/', asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await listApiKeys((req as any).user.id));
}));
apiKeyAdminRoutes.post('/', asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await createApiKey(req.body ?? {}, (req as any).user.id), 'API key created', 201);
}));
apiKeyAdminRoutes.post('/:id/revoke', asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await revokeApiKey(String(req.params.id), (req as any).user.id), 'API key revoked');
}));

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import itemRoutes from './routes/item.routes';
import referenceRoutes from './routes/reference.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import rolesRoutes from './routes/roles.routes';
import { initRolePermissions } from './services/roles.service';
import { initSystemSettings } from './services/settings.service';
import settingsRoutes from './routes/settings.routes';
import { SLIP_PUBLIC_PATH, SLIP_UPLOAD_DIR } from './lib/uploads';
import { errorHandler } from './middleware/error-handler';
import { sendError } from './utils/api-response';
import { prisma } from './lib/prisma';
import { requireAuth, requirePermission } from './middleware/auth.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (HTTPS in front of the app) the client's address comes from the proxy's header
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Slips are previewed in a frame on our own pages only
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// The app is served from this same server, so other websites are not allowed to call the API.
// To allow specific ones (e.g. a separate frontend address), list them in CORS_ORIGIN, comma-separated.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
if (allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
}
// The staff import parses its own larger body (see reference.routes.ts)
const jsonBody = express.json();
app.use((req, res, next) => (req.path === '/api/reference/employees/import' ? next() : jsonBody(req, res, next)));

// Request logging in development
if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Health check endpoint (also confirms the database answers)
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await prisma.employee.count();
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      database: 'unavailable',
      message: 'The application database is unavailable or has not been initialized.',
    });
    return;
  }
  res.json({
    status: 'healthy',
    database: 'connected',
    system: 'MoA Fixed Asset & Store Management (IFMIS Mirror)',
    scope: 'Store-level processing, tracking, and executive management dashboard',
    environment: process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev'),
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

import path from 'path';

// Serve client static dist files (built web app & PWA)
const clientDistPath = path.join(__dirname, '../../frontend/dist');
app.use(
  express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

// Uploaded IFMIS slips: only for signed-in people who can see the inventory
app.use(
  SLIP_PUBLIC_PATH,
  requireAuth,
  requirePermission('inventory.read'),
  express.static(SLIP_UPLOAD_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

// Primary API Routes
app.use('/api/auth', authRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/settings', settingsRoutes);

// SPA catch-all fallback for frontend client routing (non-API GET requests)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl.startsWith('/api')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Catch-all 404 handler for undefined API routes
app.use((req: Request, res: Response) => {
  sendError(res, `Endpoint ${req.method} ${req.originalUrl} not found`, 404);
});

// Centralized error handling middleware
app.use(errorHandler);

// Start server once the saved permission matrix is loaded
void Promise.all([initRolePermissions(), initSystemSettings()]).then(() => app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Federal Democratic Republic of Ethiopia - MoA ATS `);
  console.log(` IFMIS Store-Level Tracking & Executive Visibility API `);
  console.log(` REST API running on: http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
}));

export default app;

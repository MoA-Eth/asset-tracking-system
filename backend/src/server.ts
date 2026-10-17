import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import itemRoutes from './routes/item.routes';
import referenceRoutes from './routes/reference.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import rolesRoutes from './routes/roles.routes';
import { initRolePermissions } from './services/roles.service';
import { initSystemSettings } from './services/settings.service';
import { runStartupUpgrades } from './services/upgrades.service';
import settingsRoutes from './routes/settings.routes';
import { SLIP_PUBLIC_PATH, SLIP_UPLOAD_DIR } from './lib/uploads';
import { errorHandler } from './middleware/error-handler';
import { sendError } from './utils/api-response';
import { prisma } from './lib/prisma';
import { requireAuth, requirePermission } from './middleware/auth.middleware';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from './docs/swagger';
import { apiRateLimiter, authRateLimiter } from './middleware/rate-limiter';
import { requestLogger } from './middleware/request-logger';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (HTTPS in front of the app) the client's address comes from the proxy's header
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');

// Response compression (gzip/brotli/deflate) for payloads above 1KB
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  })
);

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Slips are previewed in a frame on our own pages only
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
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
} else if (process.env.NODE_ENV !== 'production') {
  // Allow local frontend dev server during development
  app.use(
    cors({
      origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
}

// The staff import parses its own larger body (see reference.routes.ts)
const jsonBody = express.json();
app.use((req, res, next) => (req.path === '/api/reference/employees/import' ? next() : jsonBody(req, res, next)));

// Structured HTTP request and latency logging
app.use(requestLogger);

// Health check endpoints (Liveness, Readiness, and combined)
app.get('/api/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.employee.count();
    res.json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({
      status: 'not_ready',
      database: 'unavailable',
      message: 'The application database is unavailable or has not been initialized.',
    });
  }
});

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
    version: process.env.APP_VERSION || 'dev',
    commit: process.env.APP_COMMIT || 'dev',
    timestamp: new Date().toISOString(),
  });
});

// Serve client static dist files (built web app & PWA) with immutable caching for hashed assets
const clientDistPath = path.join(__dirname, '../../frontend/dist');
app.use(
  express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(path.sep + 'assets' + path.sep) || filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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

// Global API rate limiting
app.use('/api', apiRateLimiter);

// Swagger API Documentation & raw JSON specification
app.get('/api/docs/json', (_req: Request, res: Response) => {
  res.json(swaggerDocument);
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'MoA Asset Tracking API Documentation',
}));

// Primary API Routes
app.use('/api/auth', authRateLimiter, authRoutes);
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

// Global unhandled error diagnostics
process.on('unhandledRejection', (reason) => {
  console.error('[Process Unhandled Rejection]:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err);
});

// Start server once release data changes have run and the saved permission matrix is loaded
let server: ReturnType<typeof app.listen> | undefined;

void runStartupUpgrades()
  .then(() => Promise.all([initRolePermissions(), initSystemSettings()]))
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(` Federal Democratic Republic of Ethiopia - MoA ATS `);
      console.log(` IFMIS Store-Level Tracking & Executive Visibility API `);
      console.log(` REST API running on: http://localhost:${PORT}`);
      console.log(` Health check: http://localhost:${PORT}/api/health`);
      console.log(` API Docs: http://localhost:${PORT}/api/docs`);
      console.log(`=======================================================`);
    });
  });

// Graceful shutdown handling
let isShuttingDown = false;
const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Shutting down MoA ATS gracefully...`);

  if (server) {
    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log('Database connection closed cleanly.');
      } catch (err) {
        console.error('Error during database disconnect:', err);
      }
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }

  // Force close after 10s if connections linger
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

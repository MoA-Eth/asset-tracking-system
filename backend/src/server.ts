import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import itemRoutes from './routes/item.routes';
import referenceRoutes from './routes/reference.routes';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/error-handler';
import { sendError } from './utils/api-response';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Request logging in development
if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    system: 'MoA Fixed Asset & Store Management (IFMIS Mirror)',
    scope: 'Store-level processing, tracking, and executive management dashboard',
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

// Primary API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/reference', referenceRoutes);

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

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Federal Democratic Republic of Ethiopia - MoA AMS `);
  console.log(` IFMIS Store-Level Tracking & Executive Visibility API `);
  console.log(` REST API running on: http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
});

export default app;

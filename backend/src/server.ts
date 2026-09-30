import app from './app';
import { prisma } from './lib/prisma';
import { networkInterfaces } from 'os';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a number between 1 and 65535.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Run npm run setup:local from the repository root, or configure backend/.env.');
  }
  // Fail visibly instead of serving a login screen backed by an unusable database.
  await prisma.employee.count();
  const server = app.listen(port, host, () => {
    console.log(`MoA AMS listening on ${host}:${port}`);
    console.log(`Local: http://localhost:${port}`);
    if (host === '0.0.0.0' || host === '::') {
      for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses || []) {
          if (address.family === 'IPv4' && !address.internal) {
            console.log(`Network: http://${address.address}:${port}`);
          }
        }
      }
    }
    console.log(`Health: http://localhost:${port}/api/health`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other server or change PORT in backend/.env.` : error.message);
    void prisma.$disconnect().finally(() => process.exit(1));
  });
  const shutdown = () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void start().catch(async (error) => {
  console.error('MoA AMS could not start:', error.message);
  console.error('Check backend/.env and PostgreSQL. For a new local setup, run npm run setup:local.');
  await prisma.$disconnect();
  process.exit(1);
});

export default app;

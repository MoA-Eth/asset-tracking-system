import { prisma } from '../lib/prisma';
import { cleanGeneratedSerialNumbers } from '../services/upgrades.service';

async function main() {
  console.log('--- Cleaning Auto-Generated Placeholder Serial Numbers ---');
  const count = await cleanGeneratedSerialNumbers();
  console.log(`Cleaned ${count} item(s) with placeholder serial numbers.`);
}

main()
  .catch((err) => {
    console.error('Error cleaning serial numbers:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

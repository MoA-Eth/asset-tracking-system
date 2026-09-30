// Optional development database. Never reconfigures an existing database server.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localDir = join(root, '.local');
const dataDir = join(localDir, 'postgres');
const configFile = join(localDir, 'database.json');
const envFile = join(root, 'backend', '.env');
const ifConfigured = process.argv.includes('--if-configured');
const stop = process.argv.includes('--stop');

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `${binary} failed`);
  }
  return result.stdout;
}

try {
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : null;
  const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const databaseUrl = process.env.DATABASE_URL || env.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim();

  // A configured external database always takes precedence. No initialization or seeding here.
  if (!stop && databaseUrl && databaseUrl !== config?.url) {
    if (!ifConfigured) throw new Error('DATABASE_URL already points to another database. Use npm run db:push with that database, or remove its configuration to set up an isolated local database.');
    console.log('Using the configured DATABASE_URL.');
    process.exit(0);
  }
  if ((ifConfigured || stop) && !config) process.exit(0);

  const onPath = spawnSync('which', ['pg_ctl'], { encoding: 'utf8' });
  const macVersions = existsSync('/Library/PostgreSQL')
    ? readdirSync('/Library/PostgreSQL').sort((a, b) => Number(b) - Number(a)) : [];
  const candidates = [
    process.env.POSTGRES_BIN,
    onPath.status === 0 ? dirname(onPath.stdout.trim()) : null,
    ...macVersions.map(version => `/Library/PostgreSQL/${version}/bin`),
  ];
  const bin = candidates.find(candidate => candidate && ['pg_ctl', 'initdb', 'createdb'].every(name => existsSync(join(candidate, name))));
  if (!bin) throw new Error('PostgreSQL binaries not found. Install PostgreSQL or set POSTGRES_BIN to its bin directory.');

  const pgCtl = join(bin, 'pg_ctl');
  if (stop) {
    if (spawnSync(pgCtl, ['-D', dataDir, 'status']).status === 0) {
      run(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
    }
    console.log('Local development database stopped.');
    process.exit(0);
  }

  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const settings = config || { port: 5433, password: randomBytes(24).toString('hex') };
  settings.url ||= `postgresql://moa_local:${settings.password}@127.0.0.1:${settings.port}/moa_ams?schema=public`;
  writeFileSync(configFile, JSON.stringify(settings, null, 2), { mode: 0o600 });

  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    const passwordFile = join(localDir, 'init-password');
    writeFileSync(passwordFile, settings.password, { mode: 0o600 });
    try {
      run(join(bin, 'initdb'), ['-D', dataDir, '-U', 'moa_local', '--auth=scram-sha-256', `--pwfile=${passwordFile}`, '--encoding=UTF8', '--locale=C']);
    } finally {
      unlinkSync(passwordFile);
    }
  }

  if (spawnSync(pgCtl, ['-D', dataDir, 'status']).status !== 0) {
    const socketDir = process.platform === 'darwin' ? '/private/tmp' : tmpdir();
    run(pgCtl, ['-D', dataDir, '-l', join(localDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${settings.port} -k ${socketDir}`, '-w', 'start']);
  }

  const dbEnv = { ...process.env, PGPASSWORD: settings.password };
  const query = run(join(bin, 'psql'), ['-h', '127.0.0.1', '-p', String(settings.port), '-U', 'moa_local', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'moa_ams'"], { env: dbEnv });
  if (query.trim() !== '1') {
    run(join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(settings.port), '-U', 'moa_local', 'moa_ams'], { env: dbEnv });
  }
  if (!databaseUrl) {
    const defaults = { PORT: '3000', HOST: '0.0.0.0', NODE_ENV: 'development' };
    const missingDefaults = Object.entries(defaults)
      .filter(([name]) => !new RegExp(`^\\s*${name}\\s*=`, 'm').test(env))
      .map(([name, value]) => `${name}=${value}\n`).join('');
    writeFileSync(envFile, `${env}${env && !env.endsWith('\n') ? '\n' : ''}${missingDefaults}DATABASE_URL="${settings.url}"\n`, { mode: 0o600 });
  }
  console.log(`Local development database ready on 127.0.0.1:${settings.port}.`);
} catch (error) {
  console.error(`Local database: ${error.message}`);
  process.exitCode = 1;
}

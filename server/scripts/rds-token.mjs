/**
 * Mint a short-lived (15 min) RDS IAM auth token.
 *
 * Used by the ECS startup command to inject a token into DATABASE_URL before
 * running `prisma migrate deploy` (which reads the URL directly and cannot
 * use the pg.Pool async password callback).
 *
 * Requires: AWS_REGION, DB_HOST, DB_PORT (default 5432), DB_USER.
 *
 * Modes:
 *   node scripts/rds-token.mjs                  print the raw token
 *   node scripts/rds-token.mjs --database-url   print a ready-to-use DATABASE_URL
 *
 * Prefer `--database-url` for anything that feeds Prisma: an RDS auth token is
 * itself shaped like `host:5432/?Action=connect&X-Amz-Signature=...`, so pasting
 * it raw into the password slot produces `postgresql://user:host:5432/?...@host:5432/db`
 * and the URL parser reads `host` as the port ("P1013: invalid port number").
 * The raw mode stays for humans typing a token at a psql password prompt, where
 * no URL parsing happens and percent-encoding would corrupt it.
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Signer } from '@aws-sdk/rds-signer';

const DEFAULT_PORT = 5432;
const DEFAULT_DATABASE = 'breadsheet';

/**
 * Assemble a Postgres connection URL carrying an RDS IAM token as the password.
 * Every user-supplied component is percent-encoded; the token in particular
 * contains `/`, `?`, `&` and `=`, all of which end the userinfo component early
 * if they are left as-is.
 */
export function buildIamDatabaseUrl({ host, port = DEFAULT_PORT, user, database = DEFAULT_DATABASE, token }) {
  if (!host || !user || !token) {
    throw new Error('buildIamDatabaseUrl: host, user, and token are required');
  }
  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(token)}`;
  return `postgresql://${credentials}@${host}:${port}/${encodeURIComponent(database)}?sslmode=require`;
}

async function main() {
  const hostname = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || String(DEFAULT_PORT));
  const username = process.env.DB_USER;
  const region = process.env.AWS_REGION;

  if (!hostname || !username || !region) {
    process.stderr.write('rds-token: DB_HOST, DB_USER, and AWS_REGION are required\n');
    process.exit(1);
  }

  const signer = new Signer({ hostname, port, username, region });
  const token = await signer.getAuthToken();

  if (process.argv.includes('--database-url')) {
    process.stdout.write(
      buildIamDatabaseUrl({
        host: hostname,
        port,
        user: username,
        database: process.env.DB_NAME || DEFAULT_DATABASE,
        token,
      }),
    );
    return;
  }

  process.stdout.write(token);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (invokedDirectly) {
  await main();
}

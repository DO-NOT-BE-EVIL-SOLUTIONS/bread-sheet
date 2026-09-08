import { describe, expect, it } from 'vitest';

import { buildIamDatabaseUrl } from './rds-token.mjs';

// The real shape of an RDS IAM auth token: a host:port, a path, and a signed
// query string. Every one of `:` `/` `?` `&` `=` is significant to a URL parser.
const TOKEN =
  'breadsheet-dev-database-1.cna48wy46m01.eu-west-1.rds.amazonaws.com:5432/' +
  '?Action=connect&DBUser=breadsheet_iam&X-Amz-Algorithm=AWS4-HMAC-SHA256' +
  '&X-Amz-Credential=AKIAEXAMPLE%2F20260908%2Feu-west-1%2Frds-db%2Faws4_request' +
  '&X-Amz-Date=20260908T210000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host' +
  '&X-Amz-Signature=abc123def456';

const PARTS = {
  host: 'breadsheet-dev-database-1.cna48wy46m01.eu-west-1.rds.amazonaws.com',
  port: 5432,
  user: 'breadsheet_iam',
  database: 'breadsheet',
  token: TOKEN,
};

describe('buildIamDatabaseUrl', () => {
  it('produces a URL whose authority survives the token', () => {
    const parsed = new URL(buildIamDatabaseUrl(PARTS));

    // The regression: interpolating the token unencoded ends the userinfo at its
    // first `/`, so the parser reads the token's own host as the port and Prisma
    // rejects the string with "P1013: invalid port number in database URL".
    expect(parsed.port).toBe('5432');
    expect(parsed.hostname).toBe(PARTS.host);
    expect(parsed.pathname).toBe('/breadsheet');
    expect(parsed.searchParams.get('sslmode')).toBe('require');
  });

  it('round-trips the token through the password slot byte-for-byte', () => {
    const parsed = new URL(buildIamDatabaseUrl(PARTS));

    expect(decodeURIComponent(parsed.password)).toBe(TOKEN);
    expect(parsed.username).toBe('breadsheet_iam');
  });

  it('leaves no raw URL-significant character in the password', () => {
    const url = buildIamDatabaseUrl(PARTS);
    const password = url.slice(url.indexOf(':', 'postgresql://'.length) + 1, url.lastIndexOf('@'));

    expect(password).not.toMatch(/[/?&=:]/);
  });

  it('demonstrates that the unencoded form is unparseable', () => {
    const naive = `postgresql://${PARTS.user}:${TOKEN}@${PARTS.host}:${PARTS.port}/${PARTS.database}?sslmode=require`;

    expect(() => new URL(naive)).toThrow(/Invalid URL/);
  });

  it('defaults the port and database the way start.sh did', () => {
    const parsed = new URL(
      buildIamDatabaseUrl({ host: PARTS.host, user: PARTS.user, token: TOKEN }),
    );

    expect(parsed.port).toBe('5432');
    expect(parsed.pathname).toBe('/breadsheet');
  });

  it('rejects missing components rather than emitting a half-built URL', () => {
    expect(() => buildIamDatabaseUrl({ host: PARTS.host, user: PARTS.user })).toThrow(
      /host, user, and token are required/,
    );
  });
});

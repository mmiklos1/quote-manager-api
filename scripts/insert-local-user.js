import 'dotenv/config';
import pg from 'pg';
import { normalizeEmail } from '../src/identity/email.js';
import { hashPassword } from '../src/passwords/hash.js';

// Local only. Hashes with the same Argon2id settings as login.
// Argon2id generates a salt and stores it in the hash string.
// This API does not use a password salt or pepper environment variable.
// Login will not accept a hash made with a separate secret.
//
// Usage, from this repo, after migrations:
//   node scripts/insert-local-user.js --email user@test.test --password password1
//
// Reads DATABASE_URL from the environment or from .env.

function readArgs(argv) {
  const args = { email: '', password: '' };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--email') {
      args.email = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--password') {
      args.password = argv[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--email=')) {
      args.email = arg.slice('--email='.length);
    } else if (arg.startsWith('--password=')) {
      args.password = arg.slice('--password='.length);
    } else {
      positional.push(arg);
    }
  }
  if (!args.email && positional[0]) {
    args.email = positional[0];
  }
  if (!args.password && positional[1]) {
    args.password = positional[1];
  }
  return args;
}

const { email, password } = readArgs(process.argv.slice(2));
if (!email || !password) {
  console.error('Usage: node scripts/insert-local-user.js --email <email> --password <password>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is unset.');
  process.exit(1);
}

const normalized = normalizeEmail(email);
const passwordHash = await hashPassword(password);
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query('BEGIN');
  const inserted = await client.query(
    `INSERT INTO users (email)
     VALUES ($1)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [normalized],
  );
  const userId = inserted.rows[0]?.id
    ?? (await client.query('SELECT id FROM users WHERE email = $1', [normalized])).rows[0].id;

  await client.query(
    `INSERT INTO user_passwords (user_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           updated_at = CURRENT_TIMESTAMP`,
    [userId, passwordHash],
  );
  await client.query('COMMIT');
  console.log(`Saved password for ${normalized}`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error instanceof Error ? error.message : 'Insert failed.');
  process.exitCode = 1;
} finally {
  await client.end();
}

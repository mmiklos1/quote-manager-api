import 'dotenv/config';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { currencyForCountry } from '../src/features/catalog/currency.js';
import { normalizeEmail } from '../src/utilities/identity/email.js';

// Local only. Asks for a company, inserts it, and attaches one existing user.
// The user must already exist. This script does not create a password.
// Inserting the company row also inserts that company's admin permission
// and grants it to the attached user.
//
// Usage, from this repo, after migrations:
//   node scripts/insert-local-company.js
//
// Reads DATABASE_URL from the environment or from .env.

export function parseCompanyName(inputText) {
  const name = inputText.trim();
  if (name.length === 0 || name.length > 200) {
    return null;
  }
  return name;
}

export function parseSeatLimit(inputText) {
  const text = inputText.trim();
  const digits = text === '' ? '1' : text;
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  const seatLimit = Number(digits);
  if (seatLimit < 1 || seatLimit > 100000) {
    return null;
  }
  return seatLimit;
}

export function parseCountry(inputText) {
  const text = inputText.trim();
  const code = (text === '' ? 'US' : text).toUpperCase();
  if (!currencyForCountry(code)) {
    return null;
  }
  return code;
}

export function parseEmail(inputText) {
  try {
    return normalizeEmail(inputText);
  } catch {
    return null;
  }
}

async function askUntil(rl, prompt, parse, invalidMessage) {
  while (true) {
    const value = parse(await rl.question(prompt));
    if (value !== null) {
      return value;
    }
    console.error(invalidMessage);
  }
}

async function askExistingUser(rl, client) {
  while (true) {
    const email = await askUntil(
      rl,
      'User email: ',
      parseEmail,
      'Enter an email address.',
    );
    const found = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (found.rows[0]) {
      return { email, userId: found.rows[0].id };
    }
    console.error(`No user for ${email}. Create that user first, then enter the email again.`);
    console.error('  node scripts/insert-local-user.js --email <email> --password <password>');
  }
}

export async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is unset.');
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  let rl;
  try {
    await client.connect();
    rl = readline.createInterface({ input, output });
    console.log('Create a local company and attach one existing user.');
    const name = await askUntil(
      rl,
      'Company name: ',
      parseCompanyName,
      'Enter a company name.',
    );
    const seatLimit = await askUntil(
      rl,
      'Seat limit [1]: ',
      parseSeatLimit,
      'Enter a whole number from 1 to 100000.',
    );
    const countryOfOrigin = await askUntil(
      rl,
      'Country of origin [US]: ',
      parseCountry,
      'Enter a 2-letter country code this API can price, such as US or GB.',
    );

    const { email, userId } = await askExistingUser(rl, client);

    await client.query('BEGIN');
    const company = await client.query(
      `INSERT INTO companies (name, seat_limit, country_of_origin)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, seatLimit, countryOfOrigin],
    );
    const companyId = company.rows[0].id;
    const membership = await client.query(
      `INSERT INTO company_users (company_id, user_id, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [companyId, userId],
    );
    await client.query(
      `INSERT INTO company_user_permissions (company_user_id, permission_id)
       SELECT $1, id
       FROM permissions
       WHERE company_id = $2 AND is_admin = true`,
      [membership.rows[0].id, companyId],
    );
    await client.query('COMMIT');
    console.log(`Created company ${name} (${companyId})`);
    console.log(`Attached ${email} as active membership ${membership.rows[0].id}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // No transaction was open, or the connection never started.
    }
    console.error(error instanceof Error ? error.message : 'Insert failed.');
    process.exitCode = 1;
  } finally {
    rl?.close();
    await client.end().catch(() => {});
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  await main();
}

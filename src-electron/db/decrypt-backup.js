/**
 * Decrypt a `.db.enc` backup archive back to a plain SQLite file you can open
 * in any SQLite viewer (DB Browser for SQLite, the `sqlite3` CLI, a VS Code
 * SQLite extension, etc.). Dev/support tool — does NOT touch the live DB.
 *
 * Usage:
 *   node src-electron/db/decrypt-backup.js <archive.db.enc> <passphrase> [output.db]
 *   npm run backup:decrypt -- <archive.db.enc> <passphrase> [output.db]
 *
 * The passphrase MUST be the one used when the backup was created (AES-256-GCM);
 * a wrong passphrase fails authentication and nothing is written.
 */

const path = require('path');
const fs = require('fs');
const { decryptFile } = require('../backup');

async function main() {
  const [archive, passphrase, outArg] = process.argv.slice(2);
  if (!archive || !passphrase) {
    console.error('Usage: node src-electron/db/decrypt-backup.js <archive.db.enc> <passphrase> [output.db]');
    process.exit(1);
  }
  if (!fs.existsSync(archive)) {
    console.error(`Archive not found: ${archive}`);
    process.exit(1);
  }
  const out = outArg || archive.replace(/\.enc$/i, '') || `${archive}.decrypted.db`;

  try {
    await decryptFile(archive, out, passphrase);
  } catch (e) {
    console.error(`Decrypt failed: ${e.message}`);
    console.error('(Check the passphrase — it must match the one used at backup time.)');
    process.exit(1);
  }

  console.log(`Decrypted -> ${path.resolve(out)}`);
  console.log('Open it with DB Browser for SQLite (https://sqlitebrowser.org)');
  console.log(`or on the CLI:  sqlite3 "${out}"  then e.g.  SELECT COUNT(*) FROM invoices;`);
}

main();

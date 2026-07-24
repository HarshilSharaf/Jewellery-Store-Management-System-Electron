/**
 * SQLite backup + restore. Runs in the Electron main process; the renderer
 * goes through the `backup:*` IPC channels in main.js.
 *
 * The "dump" is now the SQLite database file itself: we take a consistent,
 * WAL-safe snapshot via better-sqlite3's online backup API, then encrypt it
 * with the SAME AES-256-GCM + scrypt scheme used by the old mysqldump flow
 * (archive format unchanged below the extension). No external binaries.
 */

const Database = require('better-sqlite3');
const {
  createCipheriv, createDecipheriv, randomBytes, scryptSync,
} = require('crypto');
const {
  existsSync, promises: fsp, statSync,
} = require('fs');
const { basename, join } = require('path');

const ENC_VERSION = 1;
const ALGO = 'aes-256-gcm';
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_LEN = 16;
const GCM_IV_LEN = 12;

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
       + `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, SCRYPT_KEYLEN);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

// -- AES-256-GCM archive (unchanged from the mysqldump-era format) ----------

async function encryptFile(srcPath, destPath, passphrase) {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const iv = randomBytes(GCM_IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGO, key, iv);

  const raw = await fsp.readFile(srcPath);
  const ct = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = Buffer.alloc(1 + SCRYPT_SALT_LEN + GCM_IV_LEN);
  header.writeUInt8(ENC_VERSION, 0);
  salt.copy(header, 1);
  iv.copy(header, 1 + SCRYPT_SALT_LEN);

  await fsp.writeFile(destPath, Buffer.concat([header, ct, tag]));
}

async function decryptFile(srcPath, destPath, passphrase) {
  const buf = await fsp.readFile(srcPath);
  const version = buf.readUInt8(0);
  if (version !== ENC_VERSION) {
    throw new Error(`Unsupported backup archive version: ${version}`);
  }
  const salt = buf.subarray(1, 1 + SCRYPT_SALT_LEN);
  const iv   = buf.subarray(1 + SCRYPT_SALT_LEN, 1 + SCRYPT_SALT_LEN + GCM_IV_LEN);
  const tag  = buf.subarray(buf.length - 16);
  const ct   = buf.subarray(1 + SCRYPT_SALT_LEN + GCM_IV_LEN, buf.length - 16);

  const key = deriveKey(passphrase, Buffer.from(salt));
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));

  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  await fsp.writeFile(destPath, out);
}

// -- Backup / restore -------------------------------------------------------

/**
 * Snapshots `dbPath` to a temp file (WAL-safe), encrypts it to `<base>.db.enc`,
 * and removes the temp. Returns metadata about the archive.
 */
async function createBackup(dbPath, passphrase, targetDir) {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('createBackup: passphrase must be at least 4 characters');
  }
  if (!existsSync(dbPath)) {
    throw new Error(`createBackup: database not found: ${dbPath}`);
  }
  await ensureDir(targetDir);

  const filenameBase = `backup-${stamp()}`;
  const tmpPath = join(targetDir, `${filenameBase}.db`);
  const encPath = join(targetDir, `${filenameBase}.db.enc`);

  // Online backup: consistent snapshot even while the app holds the DB open.
  const src = new Database(dbPath, { readonly: true });
  try {
    await src.backup(tmpPath);
  } finally {
    src.close();
  }

  try {
    await encryptFile(tmpPath, encPath, passphrase);
  } finally {
    await fsp.unlink(tmpPath).catch(() => {});
  }

  const stats = statSync(encPath);
  return {
    path: encPath,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString(),
    filename: basename(encPath),
  };
}

/**
 * Decrypts `archivePath`, validates it is a healthy SQLite database, then
 * atomically replaces `dbPath` (and clears stale -wal/-shm sidecars). The
 * caller MUST close its live handle before invoking this and reopen (or
 * relaunch) afterwards.
 */
async function restoreBackup(dbPath, archivePath, passphrase) {
  if (!existsSync(archivePath)) {
    throw new Error(`restoreBackup: archive not found: ${archivePath}`);
  }
  const tmpPath = `${dbPath}.restore-${stamp()}.tmp`;
  await decryptFile(archivePath, tmpPath, passphrase);

  // Validate before we clobber the live DB.
  try {
    const check = new Database(tmpPath, { readonly: true });
    try {
      const result = check.pragma('integrity_check', { simple: true });
      if (result !== 'ok') {
        throw new Error(`restoreBackup: integrity_check failed: ${result}`);
      }
    } finally {
      check.close();
    }
  } catch (err) {
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }

  // Swap files. Remove WAL/SHM sidecars so the new DB isn't reconciled against
  // the old journal.
  await fsp.rm(dbPath, { force: true }).catch(() => {});
  await fsp.rm(`${dbPath}-wal`, { force: true }).catch(() => {});
  await fsp.rm(`${dbPath}-shm`, { force: true }).catch(() => {});
  await fsp.rename(tmpPath, dbPath);
}

async function listBackups(backupDir) {
  if (!existsSync(backupDir)) { return []; }
  const entries = await fsp.readdir(backupDir);
  const out = [];
  for (const filename of entries) {
    if (!filename.endsWith('.enc')) { continue; }
    const p = join(backupDir, filename);
    const s = statSync(p);
    out.push({
      filename,
      path: p,
      sizeBytes: s.size,
      createdAt: s.mtime.toISOString(),
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function deleteBackup(archivePath) {
  if (!existsSync(archivePath)) {
    throw new Error(`deleteBackup: archive not found: ${archivePath}`);
  }
  await fsp.unlink(archivePath);
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup,
};

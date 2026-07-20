/**
 * mysqldump-based backup + restore. Runs in the Electron main process.
 * The renderer never imports this file directly — it goes through
 * the `backup:*` IPC channels registered in main.js.
 *
 * `mysqldump` and `mysql` client binaries must be on PATH.
 */

const { spawn } = require('child_process');
const {
  createCipheriv, createDecipheriv, randomBytes, scryptSync,
} = require('crypto');
const {
  createReadStream, createWriteStream, existsSync, promises: fsp, statSync,
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

async function createBackup(config, passphrase, targetDir) {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('createBackup: passphrase must be at least 4 characters');
  }
  await ensureDir(targetDir);
  const filenameBase = `backup-${config.database}-${stamp()}`;
  const rawPath = join(targetDir, `${filenameBase}.sql`);
  const encPath = join(targetDir, `${filenameBase}.sql.enc`);

  const env = { ...process.env, MYSQL_PWD: config.password };
  const args = [
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--user=${config.user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--set-gtid-purged=OFF',
    '--column-statistics=0',
    config.database,
  ];

  await new Promise((resolve, reject) => {
    const out = createWriteStream(rawPath);
    const child = spawn('mysqldump', args, { env });
    let stderr = '';
    child.stdout.pipe(out);
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('mysqldump not found on PATH. Install MySQL client tools.'));
      } else { reject(err); }
    });
    child.on('close', (code) => {
      out.end();
      out.once('close', () => {
        if (code === 0) { resolve(); }
        else { reject(new Error(`mysqldump exited with code ${code}: ${stderr.trim()}`)); }
      });
    });
  });

  await encryptFile(rawPath, encPath, passphrase);
  await fsp.unlink(rawPath).catch(() => {});

  const stats = statSync(encPath);
  return {
    path: encPath,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString(),
    filename: basename(encPath),
  };
}

async function restoreBackup(config, archivePath, passphrase) {
  if (!existsSync(archivePath)) {
    throw new Error(`restoreBackup: archive not found: ${archivePath}`);
  }
  const tmpSql = archivePath.replace(/\.enc$/, '.decoded.sql');
  await decryptFile(archivePath, tmpSql, passphrase);

  const env = { ...process.env, MYSQL_PWD: config.password };
  const args = [
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--user=${config.user}`,
    config.database,
  ];

  try {
    await new Promise((resolve, reject) => {
      const child = spawn('mysql', args, { env });
      const input = createReadStream(tmpSql);
      let stderr = '';
      input.pipe(child.stdin);
      child.stderr.on('data', (c) => { stderr += c.toString(); });
      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('mysql client not found on PATH.'));
        } else { reject(err); }
      });
      child.on('close', (code) => {
        if (code === 0) { resolve(); }
        else { reject(new Error(`mysql exited with code ${code}: ${stderr.trim()}`)); }
      });
    });
  } finally {
    await fsp.unlink(tmpSql).catch(() => {});
  }
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

/**
 * Encrypted mysqldump-based backup + restore.
 *
 * This module runs in the Electron main process. The renderer never imports
 * it directly — it dispatches through the `backup:*` IPC channels registered
 * in `src-electron/main.js`. Kept as `.ts` to sit alongside the rest of the
 * Backend layer, but `src-electron/main.js` currently pulls in the
 * transpiled JS mirror at `Backend/Shared/backup.service.js` at runtime.
 *
 * `mysqldump` and `mysql` must be on the host PATH. On Windows we recommend
 * installing MySQL 8 client tools; on macOS `brew install mysql-client`; on
 * Linux `apt-get install mysql-client-8.0`. The renderer surfaces a friendly
 * error when the binary is missing.
 */

import { spawn } from 'child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { createReadStream, createWriteStream, existsSync, promises as fsp, statSync } from 'fs';
import { basename, join } from 'path';

export interface BackupConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface CreateBackupResult {
  path: string;
  sizeBytes: number;
  createdAt: string;
  filename: string;
}

export interface ListBackupsEntry {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

const ENC_VERSION = 1;
const ALGO = 'aes-256-gcm';
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_LEN = 16;
const GCM_IV_LEN = 12;

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
       + `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, SCRYPT_KEYLEN);
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

async function encryptFile(srcPath: string, destPath: string, passphrase: string): Promise<void> {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const iv = randomBytes(GCM_IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGO, key, iv);

  const header = Buffer.alloc(1 + SCRYPT_SALT_LEN + GCM_IV_LEN);
  header.writeUInt8(ENC_VERSION, 0);
  salt.copy(header, 1);
  iv.copy(header, 1 + SCRYPT_SALT_LEN);

  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(srcPath);
    const output = createWriteStream(destPath);
    output.write(header);
    input.on('error', reject);
    output.on('error', reject);
    cipher.on('error', reject);
    output.on('finish', () => resolve());
    input.pipe(cipher).pipe(output, { end: false });
    cipher.on('end', () => {
      try {
        const tag = cipher.getAuthTag();
        output.write(tag);
        output.end();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function decryptFile(srcPath: string, destPath: string, passphrase: string): Promise<void> {
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

function runProcess(cmd: string, args: string[], env: NodeJS.ProcessEnv,
                    onStdout?: (chunk: Buffer) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env });
    let stderr = '';
    if (onStdout) { child.stdout.on('data', onStdout); }
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Binary "${cmd}" not found on PATH. Install MySQL client tools.`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) { resolve(); }
      else { reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`)); }
    });
  });
}

export async function createBackup(
  config: BackupConfig,
  passphrase: string,
  targetDir: string
): Promise<CreateBackupResult> {
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

  const out = createWriteStream(rawPath);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('mysqldump', args, { env });
    let stderr = '';
    child.stdout.pipe(out);
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        reject(new Error('mysqldump not found on PATH. Install MySQL client tools.'));
      } else { reject(err); }
    });
    out.on('finish', () => {
      if (child.exitCode === 0 || child.exitCode === null) { resolve(); }
      else { reject(new Error(`mysqldump exited with code ${child.exitCode}: ${stderr.trim()}`)); }
    });
    out.on('error', reject);
    child.on('close', (code) => {
      out.end();
      if (code !== 0) { reject(new Error(`mysqldump exited with code ${code}: ${stderr.trim()}`)); }
    });
  });

  await encryptFile(rawPath, encPath, passphrase);
  await fsp.unlink(rawPath).catch(() => { /* best-effort */ });

  const stats = statSync(encPath);
  return {
    path: encPath,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString(),
    filename: basename(encPath),
  };
}

export async function restoreBackup(
  config: BackupConfig,
  archivePath: string,
  passphrase: string
): Promise<void> {
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

  await new Promise<void>((resolve, reject) => {
    const child = spawn('mysql', args, { env });
    const input = createReadStream(tmpSql);
    let stderr = '';
    input.pipe(child.stdin);
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        reject(new Error('mysql client not found on PATH.'));
      } else { reject(err); }
    });
    child.on('close', (code) => {
      if (code === 0) { resolve(); }
      else { reject(new Error(`mysql exited with code ${code}: ${stderr.trim()}`)); }
    });
  });

  await fsp.unlink(tmpSql).catch(() => { /* best-effort */ });
}

export async function listBackups(backupDir: string): Promise<ListBackupsEntry[]> {
  if (!existsSync(backupDir)) { return []; }
  const entries = await fsp.readdir(backupDir);
  const out: ListBackupsEntry[] = [];
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

export async function deleteBackup(archivePath: string): Promise<void> {
  if (!existsSync(archivePath)) {
    throw new Error(`deleteBackup: archive not found: ${archivePath}`);
  }
  await fsp.unlink(archivePath);
}

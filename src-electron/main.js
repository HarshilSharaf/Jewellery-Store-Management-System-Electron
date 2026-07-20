/**
 * Electron main process entrypoint.
 *
 * This file owns:
 *   - the BrowserWindow lifecycle (splash + main window)
 *   - the mysql2 connection pool
 *   - the electron-store instance
 *   - bcryptjs password hashing/compare
 *   - filesystem I/O for customer / product / user images
 *   - a small set of misc app helpers (relaunch, close-splash, logger)
 *
 * The renderer never touches any of these directly. It talks to us through
 * the channels registered here, exposed by src-electron/preload.js as
 * `window.electronAPI.*`. This is what makes `contextIsolation: true`,
 * `nodeIntegration: false`, and `webSecurity: true` viable.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const ElectronStore = require('electron-store');
const bcrypt = require('bcryptjs');
const logger = require('electron-log');
const backupService = require('./backup');
const scaleService = require('./scale');

const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Environment resolution
// ---------------------------------------------------------------------------
// In production the packaged app will pick these up from the host env or
// fall back to safe demo defaults. In development, users can `set` them in
// their shell before `npm run electron` or use the docker-compose defaults.
// We DO NOT pull in the `dotenv` package (out-of-scope per WORKSTREAM_SCOPE);
// the `.env` file is only consumed by docker-compose.
function readEnv(name, fallback) {
  const v = process.env[name];
  return (v && v.length) ? v : fallback;
}

const ENV_DB_HOST     = readEnv('MYSQL_HOST',     'localhost');
const ENV_DB_PORT     = Number(readEnv('MYSQL_PORT', '3306'));
const ENV_DB_NAME     = readEnv('MYSQL_DATABASE', 'jewellery');
const ENV_DB_USER     = readEnv('MYSQL_USER',     'zeus_user');
const ENV_DB_PASSWORD = readEnv('MYSQL_PASSWORD', 'zeus@123');

if (!process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD) {
  logger.warn(
    '[main] MYSQL_USER / MYSQL_PASSWORD not set in environment; falling ' +
    'back to .env.example defaults. Set them via .env (docker) or your ' +
    'shell before launching Electron in production.'
  );
}

// ---------------------------------------------------------------------------
// electron-store (owned by main; renderer talks to it over IPC)
// ---------------------------------------------------------------------------
const store = new ElectronStore();

// ---------------------------------------------------------------------------
// mysql2 pool (created lazily on first successful db:initialize call)
// ---------------------------------------------------------------------------
let pool = null;

async function createPool(config) {
  // Close any previous pool so credentials changes take effect. Errors
  // during close are logged but not thrown (a broken previous pool must
  // not block re-initialization).
  if (pool) {
    try { await pool.end(); } catch (e) { logger.warn('[db] previous pool end failed:', e); }
    pool = null;
  }

  pool = mysql.createPool({
    host:                  config.host     || ENV_DB_HOST,
    port:                  config.port     || ENV_DB_PORT,
    user:                  config.user     || ENV_DB_USER,
    password:              config.password || ENV_DB_PASSWORD,
    database:              config.database || ENV_DB_NAME,
    waitForConnections:    true,
    connectionLimit:       10,
    queueLimit:            0,
    enableKeepAlive:       true,
    keepAliveInitialDelay: 10_000,
  });

  // Explicit listener so protocol drops (idle timeouts, MySQL server
  // restarts, brief network blips) get logged. mysql2's pool automatically
  // discards broken connections; this just makes the failure visible.
  pool.on('error', (err) => {
    logger.error('[db] pool error:', {
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
    });
  });

  // Cheap smoke test so we surface bad creds immediately instead of on the
  // first business query.
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/**
 * Runs a callback against a fresh pool connection with a bounded timeout.
 * We wrap in a Promise.race rather than using the (non-standard) mysql2
 * `timeout` option because that option is inconsistently supported for
 * CALL statements against stored procs.
 */
async function runWithTimeout(fn, timeoutMs) {
  if (!pool) {
    throw new Error('Database pool is not initialised. Call db:initialize first.');
  }
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000;
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Query timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
let mainWindow = null;
let splashScreen = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      // Section 5: Electron hardening. Renderer must not touch Node.
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false, // preload uses require(); keep sandbox off for now.
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  splashScreen = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  if (isDev) {
    logger.info('[main] Running in development');
    splashScreen.loadURL('http://localhost:4200/assets/splashscreens/splashscreen-1/index.html');
    mainWindow.loadURL('http://localhost:4200/');
    // Auto-open DevTools in dev so preload / bootstrap errors surface. The
    // main window is created with show:false, so without this any preload
    // load error stays invisible until the app is unstuck.
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    logger.info('[main] Running in production');
    splashScreen.loadFile('./dist/browser/assets/splashscreens/splashscreen-1/index.html');
    mainWindow.loadFile('./dist/browser/index.html');
  }

  // Surface preload load failures. Silent failures here were the reason the
  // splash could hang forever: window.electronAPI is undefined and the
  // splash-close script fails the `if (api && api.app)` guard.
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    logger.error('[main] preload-error:', preloadPath, error);
  });

  // Safety net: if the renderer never triggers close_splashscreen (preload
  // failed, network stall, etc.), force the main window to show after 15s
  // so the user is never permanently locked out of the app.
  const splashFallbackTimer = setTimeout(() => {
    if (splashScreen && !splashScreen.isDestroyed()) {
      logger.warn('[main] Splash fallback timer fired; forcing main window visible');
      splashScreen.destroy();
    }
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 15_000);

  mainWindow.on('closed', () => clearTimeout(splashFallbackTimer));
};

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  // -- DB --------------------------------------------------------------------
  ipcMain.handle('db:initialize', async (_event, config) => {
    try {
      await createPool(config || {});
      return { ok: true };
    } catch (err) {
      logger.error('[db:initialize] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:execute', async (_event, sql, values, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(sql, values || []);
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('db:query', async (_event, sql, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.query(sql);
      return results;
    }, options?.timeoutMs);
  });

  // -- Metal rates ---------------------------------------------------------
  // Thin, named channels for the two most-common shop-counter flows so the
  // renderer never has to embed the SP name in a raw SQL string. Falls
  // through to the same pool as db:execute.
  ipcMain.handle('metalRates:getCurrent', async (_event, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.query('call get_current_metal_rates();');
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('metalRates:save', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call save_metal_rates(?, ?, ?, ?, ?);',
        [
          payload?.effectiveDate,
          payload?.session,
          payload?.source ?? 'manual',
          payload?.setByUserId ?? null,
          JSON.stringify(payload?.rates ?? []),
        ],
      );
      return results;
    }, options?.timeoutMs);
  });

  // -- Shop settings -------------------------------------------------------
  ipcMain.handle('shopSettings:get', async (_event, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.query('call get_shop_settings();');
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('shopSettings:save', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call save_shop_settings(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        [
          payload?.shopName,
          payload?.gstin,
          payload?.pan ?? null,
          payload?.addressLine1,
          payload?.addressLine2 ?? null,
          payload?.city,
          payload?.state,
          payload?.stateCode,
          payload?.pincode,
          payload?.phone,
          payload?.email ?? null,
          payload?.logoPath ?? null,
          payload?.invoicePrefix,
          payload?.invoiceStartFrom,
          payload?.currentInvoiceCounter,
          payload?.defaultCurrency,
          payload?.timezone,
          payload?.roundOffEnabled ? 1 : 0,
          payload?.backupDir ?? null,
          payload?.defaultPrintVariant ?? 'a4',
          payload?.actorUserId ?? null,
        ],
      );
      return results;
    }, options?.timeoutMs);
  });

  // -- Old-gold receipts ---------------------------------------------------
  ipcMain.handle('oldGold:saveReceipt', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call save_old_gold_receipt(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        [
          payload?.customerGuid,
          payload?.invoiceGuid ?? null,
          payload?.grossWeight,
          payload?.testedPurityPercent ?? null,
          payload?.testedPurityCode ?? null,
          payload?.deductionPercent,
          payload?.ratePerGram,
          payload?.creditAmount,
          payload?.remarks ?? null,
          payload?.actorUserId ?? null,
        ],
      );
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('oldGold:getReceiptsByCustomer', async (_event, customerGuid, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call get_old_gold_receipts_by_customer(?);', [customerGuid]);
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('oldGold:getReceiptByInvoice', async (_event, invoiceGuid, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call get_old_gold_receipt_by_invoice(?);', [invoiceGuid]);
      return results;
    }, options?.timeoutMs);
  });

  // -- Saving schemes ------------------------------------------------------
  ipcMain.handle('savingSchemes:enroll', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call enroll_saving_scheme(?, ?, ?, ?, ?, ?);',
        [
          payload?.customerGuid,
          payload?.planName,
          payload?.monthlyAmount,
          payload?.tenureMonths ?? 11,
          payload?.bonusInstallments ?? 1,
          payload?.actorUserId ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:recordInstallment', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call record_scheme_installment(?, ?, ?, ?, ?, ?, ?);',
        [
          payload?.schemeGuid,
          payload?.amount,
          payload?.paymentMode,
          payload?.refNumber ?? null,
          payload?.receiptDate ?? null,
          payload?.actorUserId ?? null,
          payload?.allowMultipleThisMonth ? 1 : 0,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:redeem', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call redeem_saving_scheme(?, ?, ?);',
        [payload?.schemeGuid, payload?.invoiceGuid, payload?.actorUserId ?? null],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:forfeit', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call forfeit_saving_scheme(?, ?, ?);',
        [payload?.schemeGuid, payload?.reason, payload?.actorUserId ?? null],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:getDetails', async (_event, schemeGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_saving_scheme_details(?);', [schemeGuid]);
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:getAll', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_saving_schemes(?, ?, ?, ?);',
        [
          args?.itemsPerPage ?? 20,
          args?.pageNumber ?? 1,
          args?.statusFilter ?? null,
          args?.searchQuery ?? '',
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:getByCustomer', async (_event, customerGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_saving_schemes_by_customer(?);', [customerGuid]);
      return r;
    }, options?.timeoutMs);
  });

  // -- Karigar -------------------------------------------------------------
  ipcMain.handle('karigar:addKarigar', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call add_karigar(?, ?, ?, ?, ?);',
        [
          payload?.name,
          payload?.phone ?? null,
          payload?.address ?? null,
          payload?.remarks ?? null,
          payload?.actorUserId ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getAllKarigars', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_karigars(?, ?, ?);',
        [args?.itemsPerPage ?? 20, args?.pageNumber ?? 1, args?.searchQuery ?? ''],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:updateKarigar', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call update_karigar(?, ?, ?, ?, ?, ?);',
        [
          payload?.karigarGuid,
          payload?.name,
          payload?.phone ?? null,
          payload?.address ?? null,
          payload?.remarks ?? null,
          payload?.actorUserId ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:deleteKarigar', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call delete_karigar(?, ?);',
        [args?.karigarGuid, args?.actorUserId ?? null],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:issueJob', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call issue_karigar_job(?, ?, ?, ?, ?, ?, ?, ?);',
        [
          payload?.karigarGuid,
          payload?.issueDate ?? null,
          payload?.issuedGrossWeight,
          payload?.issuedPurityCode ?? null,
          payload?.issuedStones ? JSON.stringify(payload.issuedStones) : null,
          payload?.expectedReturnDate ?? null,
          payload?.description ?? null,
          payload?.actorUserId ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:receiveJob', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call receive_karigar_job(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        [
          payload?.jobGuid,
          payload?.receivedDate ?? null,
          payload?.receivedGrossWeight,
          payload?.receivedNetWeight,
          payload?.receivedStoneWeight ?? 0,
          payload?.wastagePercentAllowed ?? 0,
          payload?.wastageGramsActual ?? 0,
          payload?.makingCharge ?? 0,
          payload?.remarks ?? null,
          payload?.actorUserId ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:settleJob', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call settle_karigar_job(?, ?, ?, ?, ?);',
        [
          payload?.jobGuid,
          payload?.settlementAmount,
          payload?.paymentMode,
          payload?.refNumber ?? null,
          payload?.actorUserId ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getJobDetails', async (_event, jobGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_karigar_job_card_details(?);', [jobGuid]);
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getAllJobs', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_karigar_jobs(?, ?, ?, ?);',
        [
          args?.itemsPerPage ?? 20,
          args?.pageNumber ?? 1,
          args?.karigarGuid ?? null,
          args?.statusFilter ?? null,
        ],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getLedger', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_karigar_ledger(?, ?, ?);',
        [args?.karigarGuid, args?.dateFrom ?? null, args?.dateTo ?? null],
      );
      return r;
    }, options?.timeoutMs);
  });

  // -- Reports -------------------------------------------------------------
  ipcMain.handle('reports:dayBook', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_day_book(?, ?);', [args?.dateFrom, args?.dateTo]);
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:salesRegister', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_sales_register(?, ?, ?, ?);',
        [args?.dateFrom, args?.dateTo, args?.customerGuid ?? null, args?.statusFilter ?? null],
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:stockSummaryByPurity', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_stock_summary_by_purity(?);', [args?.asOfDate ?? null]);
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:gstr1Export', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_gstr1_export_rows(?);', [args?.monthYear ?? null]);
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:lowStockByCategory', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_low_stock_by_category(?);', [args?.thresholdCount ?? 3]);
      return r;
    }, options?.timeoutMs);
  });

  // -- Auth: user permissions ---------------------------------------------
  ipcMain.handle('auth:getUserPermissions', async (_event, userId, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_user_permissions(?);', [userId]);
      return r;
    }, options?.timeoutMs);
  });

  // -- Backup + restore ----------------------------------------------------
  async function currentDbConfig() {
    return {
      host:     ENV_DB_HOST,
      port:     ENV_DB_PORT,
      database: ENV_DB_NAME,
      user:     ENV_DB_USER,
      password: ENV_DB_PASSWORD,
    };
  }

  async function currentBackupDir(argDir) {
    if (typeof argDir === 'string' && argDir.length) { return argDir; }
    try {
      if (pool) {
        const [rows] = await pool.query('SELECT backupDir FROM shopsettings WHERE id = 1;');
        if (rows && rows[0] && rows[0].backupDir) { return rows[0].backupDir; }
      }
    } catch (_) { /* fall through */ }
    return path.join(app.getPath('userData'), 'backups');
  }

  ipcMain.handle('backup:create', async (_event, payload) => {
    const cfg = { ...(await currentDbConfig()), ...(payload?.dbConfig || {}) };
    const dir = await currentBackupDir(payload?.targetDir);
    try {
      const result = await backupService.createBackup(cfg, payload?.passphrase, dir);
      return { ok: true, result };
    } catch (err) {
      logger.error('[backup:create] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restore', async (_event, payload) => {
    const cfg = { ...(await currentDbConfig()), ...(payload?.dbConfig || {}) };
    try {
      await backupService.restoreBackup(cfg, payload?.archivePath, payload?.passphrase);
      return { ok: true };
    } catch (err) {
      logger.error('[backup:restore] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:list', async (_event, payload) => {
    const dir = await currentBackupDir(payload?.backupDir);
    try {
      const entries = await backupService.listBackups(dir);
      return { ok: true, entries, backupDir: dir };
    } catch (err) {
      logger.error('[backup:list] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:delete', async (_event, payload) => {
    if (payload?.actorType && payload.actorType !== 'admin') {
      return { ok: false, error: 'Forbidden: canBackup' };
    }
    try {
      await backupService.deleteBackup(payload?.archivePath);
      return { ok: true };
    } catch (err) {
      logger.error('[backup:delete] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  // -- Native dialog (directory picker) ------------------------------------
  ipcMain.handle('dialog:chooseDirectory', async (_event, payload) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: payload?.title || 'Choose a directory',
        defaultPath: payload?.defaultPath || undefined,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths || !result.filePaths.length) {
        return { canceled: true, filePaths: [] };
      }
      return { canceled: false, filePaths: result.filePaths };
    } catch (err) {
      logger.error('[dialog:chooseDirectory] failed:', err);
      return { canceled: true, filePaths: [], error: err.message };
    }
  });

  // -- Weighing scale (RS-232 via serialport) -------------------------------
  ipcMain.handle('scale:getStatus', async () => {
    return scaleService.status();
  });

  ipcMain.handle('scale:listPorts', async () => {
    try {
      const ports = await scaleService.listPorts();
      return { ok: true, ports };
    } catch (err) {
      logger.error('[scale:listPorts] failed:', err);
      return { ok: false, error: err.message, ports: [] };
    }
  });

  ipcMain.handle('scale:open', async (_event, payload) => {
    try {
      const result = await scaleService.open(
        payload?.portPath,
        payload?.baudRate,
        (reading) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scale:reading', reading);
          }
        },
      );
      return { ok: true, ...result };
    } catch (err) {
      logger.error('[scale:open] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('scale:close', async () => {
    try {
      await scaleService.close();
      return { ok: true };
    } catch (err) {
      logger.error('[scale:close] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('scale:getReading', async () => {
    return scaleService.getReading();
  });

  // -- Store -----------------------------------------------------------------
  ipcMain.handle('store:get',    (_event, key)        => store.get(key));
  ipcMain.handle('store:set',    (_event, key, value) => { store.set(key, value); return true; });
  ipcMain.handle('store:delete', (_event, key)        => { store.delete(key); return true; });

  ipcMain.handle('store:getDefaultDbInfo', () => ({
    DATABASE_NAME:     ENV_DB_NAME,
    DATABASE_USERNAME: ENV_DB_USER,
    DATABASE_PASSWORD: ENV_DB_PASSWORD,
    DATABASE_PORT:     ENV_DB_PORT,
    DATABASE_HOST:     ENV_DB_HOST,
    LAST_UPDATED_ON:   new Date().toUTCString(),
  }));

  // -- Auth (bcrypt lives here now; renderer no longer imports bcryptjs) ----
  ipcMain.handle('auth:compareHash', async (_event, plaintext, hash) => {
    if (typeof plaintext !== 'string' || typeof hash !== 'string') {
      return false;
    }
    return bcrypt.compare(plaintext, hash);
  });

  ipcMain.handle('auth:generateHash', async (_event, plaintext, rounds) => {
    const cost = Number.isFinite(rounds) ? rounds : 10;
    return bcrypt.hash(plaintext, cost);
  });

  // -- File system (images) -------------------------------------------------
  ipcMain.handle('fs:getPicturesDirectory', () => app.getPath('pictures'));

  ipcMain.handle('fs:ensureDir', (_event, dirPath) => {
    if (typeof dirPath !== 'string' || !dirPath) return false;
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return true;
  });

  ipcMain.handle('fs:writeImage', (_event, savePath, base64) => {
    if (typeof savePath !== 'string' || typeof base64 !== 'string') {
      throw new Error('fs:writeImage requires (savePath, base64)');
    }
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const bytes = Buffer.from(base64, 'base64');
    fs.writeFileSync(savePath, bytes);
    return true;
  });

  ipcMain.handle('fs:readImageBase64', (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return '';
    if (!fs.existsSync(filePath)) return '';
    const buf = fs.readFileSync(filePath);
    return buf.toString('base64');
  });

  ipcMain.handle('fs:deleteImage', (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return false;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('fs:exists', (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return false;
    return fs.existsSync(filePath);
  });

  // -- App ------------------------------------------------------------------
  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.quit();
  });

  ipcMain.handle('close_splashscreen', () => {
    logger.info('[main] Closing splashscreen');
    if (splashScreen && !splashScreen.isDestroyed()) {
      splashScreen.destroy();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // -- Logger --------------------------------------------------------------
  ipcMain.handle('logger:info',  (_event, msg) => { logger.info(msg);  });
  ipcMain.handle('logger:error', (_event, msg) => { logger.error(msg); });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', async () => {
  try { if (pool) await pool.end(); } catch (_e) { /* ignore */ }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

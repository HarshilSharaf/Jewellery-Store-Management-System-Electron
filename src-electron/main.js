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

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const ElectronStore = require('electron-store');
const logger = require('electron-log');

// SQLite data layer. Phase 1: ported stored procedures are routed to SQLite
// via db/router.js; unported procs and raw SQL still hit the mysql2 pool.
const sqliteDb = require('./db');
const sqliteRouter = require('./db/router');

// ---------------------------------------------------------------------------
// Chromium / V8 command-line switches. Must be appended BEFORE app.whenReady()
// resolves; Chromium locks these once the browser process finishes bootstrap.
// ---------------------------------------------------------------------------
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disk-cache-size', String(50 * 1024 * 1024));

// Force the SwiftShader software rasterizer path on shop PCs with outdated
// Intel HD drivers (leading GPU-process crash source on the Tier-2/3
// hardware target). Costs ~5% renderer CPU on modern GPUs but eliminates
// the crash mode entirely. Gated so a shopkeeper on modern hardware can
// opt out via `set ZEUS_DISABLE_GPU=0` before launch.
if (process.env.ZEUS_DISABLE_GPU !== '0') {
  app.disableHardwareAcceleration();
}

// Rotate electron-log file transport at 5 MB so a long-running shop install
// doesn't grow %APPDATA%\<app>\logs\ without bound over months of use.
logger.transports.file.maxSize = 5 * 1024 * 1024;

// Lazy-loaded native / feature-bindings. Deferring require() until the first
// handler invocation keeps cold-boot below the splash paint (~40-100 ms) and
// prevents a broken native binding from crashing app startup.
let backupService = null;
let scaleService = null;
let whatsappService = null;
let ibjaService = null;
let bcrypt = null;
function getBackupService()   { if (!backupService)   backupService   = require('./backup');   return backupService; }
function getScaleService()    { if (!scaleService)    scaleService    = require('./scale');    return scaleService; }
function getWhatsappService() { if (!whatsappService) whatsappService = require('./whatsapp'); return whatsappService; }
function getIbjaService()     { if (!ibjaService)     ibjaService     = require('./ibja');     return ibjaService; }
function getBcrypt()          { if (!bcrypt)          bcrypt          = require('bcryptjs');   return bcrypt; }

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

// Event-driven pool-ready signal. Replaces the permanent 2 s setInterval
// (`bootPoll`) that used to guard `scheduleNextIbjaFire`.
let resolvePoolReady;
const poolReady = new Promise((resolve) => { resolvePoolReady = resolve; });

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
    // Single-shop single-user peaks at 2-3 concurrent queries; 4 is plenty
    // and saves ~2-3 MB per unused pool slot.
    connectionLimit:       4,
    queueLimit:            0,
    enableKeepAlive:       true,
    keepAliveInitialDelay: 10_000,
    // Release idle connections after 60 s so mysql server doesn't hold
    // sockets open for the app lifetime.
    idleTimeout:           60_000,
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

  if (typeof resolvePoolReady === 'function') {
    resolvePoolReady();
    resolvePoolReady = null;
  }
}

/**
 * mysql2 v3+ throws on `undefined` bind values ("Bind parameters must not
 * contain undefined"). Earlier versions silently coerced to NULL. Any
 * renderer-side payload with a missing optional field can trip this. We
 * coerce here so a single missing field can't crash a whole handler.
 */
function sanitizeBinds(values) {
  if (!Array.isArray(values)) { return []; }
  return values.map((v) => (v === undefined ? null : v));
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
    // Warm ivory pre-paint matches the app's light-theme --color-bg
    // (--sand-2 = #f9f9f8 in client/styles.scss). Chromium paints this
    // BEFORE Angular's first frame, eliminating the white-flash gap
    // between splash-destroy and renderer first paint.
    backgroundColor: '#f9f9f8',
    webPreferences: {
      // Section 5: Electron hardening. Renderer must not touch Node.
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      spellcheck: false,
      v8CacheOptions: 'code',
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Splash is a bare Chromium tab with no JS beyond CSS animations; drop
  // the webPreferences block. Electron 20+ defaults (sandbox: true,
  // contextIsolation: true, nodeIntegration: false) are the right posture
  // and drop ~30 MB per splash-renderer overhead.
  splashScreen = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#f9f9f8',
  });

  // ready-to-show pre-paints the background but does NOT show the window:
  // splash-close IPC drives the actual show. This kills the white flash
  // between splash-destroy and Angular first paint.
  mainWindow.once('ready-to-show', () => {
    // Pre-paint only. The backgroundColor is already applied by Chromium;
    // this event just guarantees we've hit "renderer is ready to paint"
    // before splash-close triggers show.
    logger.info('[main] mainWindow ready-to-show; awaiting splash-close IPC.');
  });

  if (isDev) {
    logger.info('[main] Running in development');
    splashScreen.loadURL('http://localhost:4200/assets/splashscreens/splashscreen-1/index.html');
    mainWindow.loadURL('http://localhost:4200/');
  } else {
    logger.info('[main] Running in production');
    splashScreen.loadFile('./dist/browser/assets/splashscreens/splashscreen-1/index.html');
    mainWindow.loadFile('./dist/browser/index.html');
  }

  // Defensive: slam DevTools closed in the packaged build even if a user
  // hits Ctrl+Shift+I; prevents accidental IPC-internals exposure.
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // Surface preload load failures. Silent failures here were the reason the
  // splash could hang forever: window.electronAPI is undefined and the
  // splash-close script fails the `if (api && api.app)` guard.
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    logger.error('[main] preload-error:', preloadPath, error);
  });

  // Safety net: if the renderer never triggers close_splashscreen (preload
  // failed, network stall, etc.), notify the renderer, then force-show.
  // 10s is the ops signal window; the user learns "something went wrong"
  // rather than watching the splash disappear silently.
  const splashFallbackTimer = setTimeout(() => {
    logger.warn('[main] Splash fallback timer fired; forcing main window visible');
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('boot:degraded'); } catch (_) { /* ignore */ }
    }
    if (splashScreen && !splashScreen.isDestroyed()) {
      splashScreen.destroy();
    }
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 10_000);

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
    // Phase 1: route ported stored procedures to SQLite. Unported procs and
    // raw SQL fall through to the legacy mysql2 pool below.
    if (sqliteRouter.isHandled(sql)) {
      try {
        return sqliteRouter.tryExecute(sql, values, () => sqliteDb.getDb());
      } catch (err) {
        logger.error(`[db:execute] sqlite proc failed (${sqliteRouter.procName(sql)}):`, err);
        throw err;
      }
    }
    return runWithTimeout(async () => {
      const [results] = await pool.execute(sql, sanitizeBinds(values));
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
        sanitizeBinds([
          payload?.effectiveDate,
          payload?.session,
          payload?.source ?? 'manual',
          payload?.setByUserId ?? null,
          JSON.stringify(payload?.rates ?? []),
        ]),
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
        'call save_shop_settings(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
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
          payload?.typographyPreset ?? 'editorial',
          payload?.actorUserId ?? null,
        ]),
      );
      return results;
    }, options?.timeoutMs);
  });

  // -- Old-gold receipts ---------------------------------------------------
  ipcMain.handle('oldGold:saveReceipt', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call save_old_gold_receipt(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
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
        ]),
      );
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('oldGold:getReceiptsByCustomer', async (_event, customerGuid, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call get_old_gold_receipts_by_customer(?);', sanitizeBinds([customerGuid]));
      return results;
    }, options?.timeoutMs);
  });

  ipcMain.handle('oldGold:getReceiptByInvoice', async (_event, invoiceGuid, options) => {
    return runWithTimeout(async () => {
      const [results] = await pool.execute(
        'call get_old_gold_receipt_by_invoice(?);', sanitizeBinds([invoiceGuid]));
      return results;
    }, options?.timeoutMs);
  });

  // -- Saving schemes ------------------------------------------------------
  ipcMain.handle('savingSchemes:enroll', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call enroll_saving_scheme(?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.customerGuid,
          payload?.planName,
          payload?.monthlyAmount,
          payload?.tenureMonths ?? 11,
          payload?.bonusInstallments ?? 1,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:recordInstallment', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call record_scheme_installment(?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.schemeGuid,
          payload?.amount,
          payload?.paymentMode,
          payload?.refNumber ?? null,
          payload?.receiptDate ?? null,
          payload?.actorUserId ?? null,
          payload?.allowMultipleThisMonth ? 1 : 0,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:redeem', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call redeem_saving_scheme(?, ?, ?);',
        sanitizeBinds([payload?.schemeGuid, payload?.invoiceGuid, payload?.actorUserId ?? null]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:forfeit', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call forfeit_saving_scheme(?, ?, ?);',
        sanitizeBinds([payload?.schemeGuid, payload?.reason, payload?.actorUserId ?? null]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:getDetails', async (_event, schemeGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_saving_scheme_details(?);', sanitizeBinds([schemeGuid]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:getAll', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_saving_schemes(?, ?, ?, ?);',
        sanitizeBinds([
          args?.itemsPerPage ?? 20,
          args?.pageNumber ?? 1,
          args?.statusFilter ?? null,
          args?.searchQuery ?? '',
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('savingSchemes:getByCustomer', async (_event, customerGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_saving_schemes_by_customer(?);', sanitizeBinds([customerGuid]));
      return r;
    }, options?.timeoutMs);
  });

  // -- Karigar -------------------------------------------------------------
  ipcMain.handle('karigar:addKarigar', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call add_karigar(?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.name,
          payload?.phone ?? null,
          payload?.address ?? null,
          payload?.remarks ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getAllKarigars', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_karigars(?, ?, ?);',
        sanitizeBinds([args?.itemsPerPage ?? 20, args?.pageNumber ?? 1, args?.searchQuery ?? '']),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:updateKarigar', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call update_karigar(?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.karigarGuid,
          payload?.name,
          payload?.phone ?? null,
          payload?.address ?? null,
          payload?.remarks ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:deleteKarigar', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call delete_karigar(?, ?);',
        sanitizeBinds([args?.karigarGuid, args?.actorUserId ?? null]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:issueJob', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call issue_karigar_job(?, ?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.karigarGuid,
          payload?.issueDate ?? null,
          payload?.issuedGrossWeight,
          payload?.issuedPurityCode ?? null,
          payload?.issuedStones ? JSON.stringify(payload.issuedStones) : null,
          payload?.expectedReturnDate ?? null,
          payload?.description ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:receiveJob', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call receive_karigar_job(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
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
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:settleJob', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call settle_karigar_job(?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.jobGuid,
          payload?.settlementAmount,
          payload?.paymentMode,
          payload?.refNumber ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getJobDetails', async (_event, jobGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_karigar_job_card_details(?);', sanitizeBinds([jobGuid]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getAllJobs', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_karigar_jobs(?, ?, ?, ?);',
        sanitizeBinds([
          args?.itemsPerPage ?? 20,
          args?.pageNumber ?? 1,
          args?.karigarGuid ?? null,
          args?.statusFilter ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('karigar:getLedger', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_karigar_ledger(?, ?, ?);',
        sanitizeBinds([args?.karigarGuid, args?.dateFrom ?? null, args?.dateTo ?? null]),
      );
      return r;
    }, options?.timeoutMs);
  });

  // -- Reports -------------------------------------------------------------
  ipcMain.handle('reports:dayBook', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_day_book(?, ?);', sanitizeBinds([args?.dateFrom, args?.dateTo]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:salesRegister', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_sales_register(?, ?, ?, ?);',
        sanitizeBinds([args?.dateFrom, args?.dateTo, args?.customerGuid ?? null, args?.statusFilter ?? null]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:stockSummaryByPurity', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_stock_summary_by_purity(?);', sanitizeBinds([args?.asOfDate ?? null]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:gstr1Export', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_gstr1_export_rows(?);', sanitizeBinds([args?.monthYear ?? null]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('reports:lowStockByCategory', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_low_stock_by_category(?);', sanitizeBinds([args?.thresholdCount ?? 3]));
      return r;
    }, options?.timeoutMs);
  });

  // -- Auth: user permissions ---------------------------------------------
  ipcMain.handle('auth:getUserPermissions', async (_event, userId, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_user_permissions(?);', sanitizeBinds([userId]));
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
      const result = await getBackupService().createBackup(cfg, payload?.passphrase, dir);
      return { ok: true, result };
    } catch (err) {
      logger.error('[backup:create] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restore', async (_event, payload) => {
    const cfg = { ...(await currentDbConfig()), ...(payload?.dbConfig || {}) };
    try {
      await getBackupService().restoreBackup(cfg, payload?.archivePath, payload?.passphrase);
      return { ok: true };
    } catch (err) {
      logger.error('[backup:restore] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:list', async (_event, payload) => {
    const dir = await currentBackupDir(payload?.backupDir);
    try {
      const entries = await getBackupService().listBackups(dir);
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
      await getBackupService().deleteBackup(payload?.archivePath);
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
    return getScaleService().status();
  });

  ipcMain.handle('scale:listPorts', async () => {
    try {
      const ports = await getScaleService().listPorts();
      return { ok: true, ports };
    } catch (err) {
      logger.error('[scale:listPorts] failed:', err);
      return { ok: false, error: err.message, ports: [] };
    }
  });

  ipcMain.handle('scale:open', async (_event, payload) => {
    try {
      const result = await getScaleService().open(
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
      await getScaleService().close();
      return { ok: true };
    } catch (err) {
      logger.error('[scale:close] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('scale:getReading', async () => {
    return getScaleService().getReading();
  });

  // -- Repair tickets ------------------------------------------------------
  ipcMain.handle('repair:create', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call create_repair_ticket(?, ?, ?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.customerGuid,
          payload?.receivedByUserId ?? null,
          payload?.itemDescription,
          payload?.itemPhotoPath ?? null,
          payload?.weight ?? null,
          payload?.estimatedCharge ?? null,
          payload?.estimatedReturnDate ?? null,
          payload?.notes ?? null,
          payload?.karigarGuid ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:updateStatus', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call update_repair_status(?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.ticketGuid,
          payload?.newStatus,
          payload?.actorUserId ?? null,
          payload?.actualCharge ?? null,
          payload?.paymentMode ?? null,
          payload?.paymentRef ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:settle', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call settle_repair_ticket(?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.ticketGuid,
          payload?.actualCharge,
          payload?.paymentMode,
          payload?.paymentRef ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:linkToKarigar', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call link_repair_to_karigar(?, ?, ?, ?);',
        sanitizeBinds([
          payload?.ticketGuid,
          payload?.karigarGuid,
          payload?.karigarJobGuid ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:getDetails', async (_event, ticketGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute('call get_repair_ticket_details(?);', sanitizeBinds([ticketGuid]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:getAll', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_all_repair_tickets(?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          args?.status ?? null,
          args?.customerSearch ?? null,
          args?.dateFrom ?? null,
          args?.dateTo ?? null,
          args?.pageSize ?? 20,
          args?.page ?? 1,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:getByCustomer', async (_event, customerGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_repair_tickets_by_customer(?);', sanitizeBinds([customerGuid]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('repair:delete', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call delete_repair_ticket(?, ?);',
        sanitizeBinds([payload?.ticketGuid, payload?.actorUserId ?? null]),
      );
      return r;
    }, options?.timeoutMs);
  });

  // -- WhatsApp -----------------------------------------------------------
  async function readWhatsappConfig() {
    if (!pool) return null;
    const [rows] = await pool.query(
      'SELECT whatsappPhoneNumberId, whatsappBusinessAccountId, whatsappApiToken, whatsappEnabled ' +
      'FROM shopsettings WHERE id = 1;'
    );
    return (rows && rows[0]) ? rows[0] : null;
  }

  ipcMain.handle('whatsapp:send', async (_event, payload) => {
    if (!pool) return { ok: false, error: 'db_not_initialised' };
    const cfg = await readWhatsappConfig();
    if (!cfg || !cfg.whatsappEnabled) {
      return { ok: false, error: 'not_configured' };
    }

    // Queue the send row first so we always have an audit trail.
    let sendGuid = null;
    try {
      const [queued] = await pool.execute(
        'call queue_whatsapp_send(?, ?, ?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.invoiceGuid ?? null,
          payload?.customerGuid,
          payload?.templateName,
          payload?.templateLanguage ?? 'en',
          payload?.templateVariables ? JSON.stringify(payload.templateVariables) : null,
          payload?.attachmentUrl ?? null,
          payload?.phoneNumber,
          payload?.sentByUserId ?? null,
        ]),
      );
      const first = Array.isArray(queued) && queued[0] && queued[0][0];
      sendGuid = first ? first.sendGuid : null;
    } catch (err) {
      logger.error('[whatsapp:send] queue failed:', err);
      return { ok: false, error: err.message };
    }

    const apiResult = await getWhatsappService().sendTemplateMessage({
      phoneNumberId: cfg.whatsappPhoneNumberId,
      apiToken:      cfg.whatsappApiToken,
      to:            payload?.phoneNumber,
      templateName:  payload?.templateName,
      language:      payload?.templateLanguage ?? 'en',
      components:    payload?.components,
    });

    if (sendGuid) {
      try {
        await pool.execute(
          'call update_whatsapp_status(?, ?, ?, ?, ?);',
          sanitizeBinds([
            sendGuid,
            apiResult.ok ? 'sent' : 'failed',
            apiResult.messageId ?? null,
            apiResult.ok ? null : (apiResult.error || 'unknown'),
            payload?.sentByUserId ?? null,
          ]),
        );
      } catch (err) {
        logger.error('[whatsapp:send] update_whatsapp_status failed:', err);
      }
    }

    return apiResult.ok
      ? { ok: true, sendGuid, messageId: apiResult.messageId }
      : { ok: false, sendGuid, error: apiResult.error };
  });

  ipcMain.handle('whatsapp:updateStatus', async (_event, payload, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call update_whatsapp_status(?, ?, ?, ?, ?);',
        sanitizeBinds([
          payload?.sendGuid,
          payload?.newStatus,
          payload?.metaMessageId ?? null,
          payload?.errorMessage ?? null,
          payload?.actorUserId ?? null,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('whatsapp:getLog', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_whatsapp_send_log(?, ?, ?, ?, ?, ?);',
        sanitizeBinds([
          args?.customerGuid ?? null,
          args?.status ?? null,
          args?.dateFrom ?? null,
          args?.dateTo ?? null,
          args?.pageSize ?? 20,
          args?.page ?? 1,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('whatsapp:getByCustomer', async (_event, customerGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_whatsapp_sends_by_customer(?);', sanitizeBinds([customerGuid]));
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('whatsapp:getByInvoice', async (_event, invoiceGuid, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_whatsapp_sends_by_invoice(?);', sanitizeBinds([invoiceGuid]));
      return r;
    }, options?.timeoutMs);
  });

  // -- IBJA (rate scraper + snapshot log) ----------------------------------
  ipcMain.handle('ibja:fetchNow', async () => {
    return runIbjaFetchAndSave();
  });

  ipcMain.handle('ibja:getSnapshots', async (_event, args, options) => {
    return runWithTimeout(async () => {
      const [r] = await pool.execute(
        'call get_ibja_snapshots(?, ?, ?, ?, ?);',
        sanitizeBinds([
          args?.status ?? null,
          args?.dateFrom ?? null,
          args?.dateTo ?? null,
          args?.pageSize ?? 20,
          args?.page ?? 1,
        ]),
      );
      return r;
    }, options?.timeoutMs);
  });

  ipcMain.handle('ibja:getScheduleInfo', () => ibjaScheduleInfo());

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
    return getBcrypt().compare(plaintext, hash);
  });

  ipcMain.handle('auth:generateHash', async (_event, plaintext, rounds) => {
    const cost = Number.isFinite(rounds) ? rounds : 10;
    return getBcrypt().hash(plaintext, cost);
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
// IBJA scheduler (twice-daily 10:30 IST + 16:30 IST). We roll our own with
// setTimeout instead of pulling in node-cron; the whole scheduler is <40
// lines and node-cron would be a new npm dependency (out of scope).
// ---------------------------------------------------------------------------
const IST_OFFSET_MIN = 330;
const IBJA_AM_HOUR_IST = 10;
const IBJA_AM_MIN_IST  = 30;
const IBJA_PM_HOUR_IST = 16;
const IBJA_PM_MIN_IST  = 30;

let ibjaTimer = null;
let ibjaNextFireAt = null;

function nextIstFire(hourIst, minIst, from = new Date()) {
  // Compute the next `hh:mm IST` firing instant as a UTC Date. IST = UTC+5:30.
  const targetIstMinutes = hourIst * 60 + minIst;
  const nowUtcMinutes = from.getUTCHours() * 60 + from.getUTCMinutes();
  const nowIstMinutes = (nowUtcMinutes + IST_OFFSET_MIN) % (24 * 60);

  const start = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    0, 0, 0, 0,
  ));
  let msFromMidnightUtc = (targetIstMinutes - IST_OFFSET_MIN) * 60_000;
  while (msFromMidnightUtc < 0) msFromMidnightUtc += 24 * 60 * 60_000;

  let fire = new Date(start.getTime() + msFromMidnightUtc);
  if (fire.getTime() <= from.getTime() || nowIstMinutes >= targetIstMinutes + 1) {
    fire = new Date(fire.getTime() + 24 * 60 * 60_000);
  }
  return fire;
}

function ibjaScheduleInfo(now = new Date()) {
  return {
    scheduled: !!ibjaTimer,
    nextFireAt: ibjaNextFireAt ? ibjaNextFireAt.toISOString() : null,
    nextAmAt: nextIstFire(IBJA_AM_HOUR_IST, IBJA_AM_MIN_IST, now).toISOString(),
    nextPmAt: nextIstFire(IBJA_PM_HOUR_IST, IBJA_PM_MIN_IST, now).toISOString(),
  };
}

async function runIbjaFetchAndSave() {
  if (!pool) return { ok: false, error: 'db_not_initialised' };
  const now = new Date();
  const result = await getIbjaService().fetchIbjaRates(now);

  const istTotal = now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN;
  const istHour  = Math.floor((istTotal % (24 * 60)) / 60);
  const session  = result.session || (istHour < 14 ? 'AM' : 'PM');

  try {
    if (result.ok) {
      await pool.execute(
        'call save_ibja_snapshot(?, ?, ?, ?);',
        sanitizeBinds([session, result.rawResponse ?? '', 'success', null]),
      );
      const purities = result.purities || {};
      const nowDate = now.toISOString().slice(0, 10);
      const ratesArray = [];
      for (const [key, val] of Object.entries(purities)) {
        if (key === 'silver_999') ratesArray.push({ purityCode: 'S999', ratePerGram: val });
        else if (['999', '995', '916', '750', '585'].includes(key)) {
          ratesArray.push({ purityCode: key, ratePerGram: val });
        }
      }
      if (ratesArray.length) {
        try {
          await pool.execute(
            'call save_metal_rates(?, ?, ?, ?, ?);',
            sanitizeBinds([nowDate, session, 'ibja', null, JSON.stringify(ratesArray)]),
          );
        } catch (rateErr) {
          logger.error('[ibja] save_metal_rates failed:', rateErr);
        }
      }
      return { ok: true, session, purities };
    }
    await pool.execute(
      'call save_ibja_snapshot(?, ?, ?, ?);',
      sanitizeBinds([
        session,
        result.rawResponse ?? '',
        result.reason || 'network_error',
        result.error || null,
      ]),
    );
    return { ok: false, error: result.error || result.reason };
  } catch (err) {
    logger.error('[ibja] run failed:', err);
    return { ok: false, error: err.message };
  }
}

async function scheduleNextIbjaFire() {
  if (!pool) {
    logger.warn('[ibja] scheduleNextIbjaFire called with no pool; skipping.');
    return;
  }
  let enabled = false;
  try {
    const [rows] = await pool.query(
      'SELECT ibjaAutoFetchEnabled FROM shopsettings WHERE id = 1;'
    );
    enabled = !!(rows && rows[0] && rows[0].ibjaAutoFetchEnabled);
  } catch (err) {
    logger.warn('[ibja] read shopsettings failed:', err.message);
  }
  if (!enabled) {
    ibjaNextFireAt = null;
    if (ibjaTimer) { clearTimeout(ibjaTimer); ibjaTimer = null; }
    return;
  }

  const now = new Date();
  const am = nextIstFire(IBJA_AM_HOUR_IST, IBJA_AM_MIN_IST, now);
  const pm = nextIstFire(IBJA_PM_HOUR_IST, IBJA_PM_MIN_IST, now);
  ibjaNextFireAt = am.getTime() < pm.getTime() ? am : pm;

  const delayMs = Math.max(0, ibjaNextFireAt.getTime() - now.getTime());
  if (ibjaTimer) clearTimeout(ibjaTimer);
  ibjaTimer = setTimeout(async () => {
    try {
      await runIbjaFetchAndSave();
    } catch (err) {
      logger.error('[ibja] scheduled fire failed:', err);
    }
    scheduleNextIbjaFire();
  }, delayMs);
  logger.info(`[ibja] next fetch at ${ibjaNextFireAt.toISOString()}`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  // Phase 0: bring up the SQLite handle (create file + run migrations) so the
  // native module, schema build, and packaging path are exercised on every
  // launch. Wrapped so a broken binding is logged, not fatal, while mysql2
  // still owns the live data path.
  try {
    sqliteDb.initDatabase();
  } catch (err) {
    logger.error('[db] SQLite initialisation failed:', err);
  }

  registerIpcHandlers();
  createWindow();
  poolReady.then(() => {
    scheduleNextIbjaFire().catch((err) =>
      logger.warn('[ibja] initial schedule failed:', err.message));
  });
});

// Consolidated shutdown: closes serialport, clears IBJA timer, ends mysql2
// pool, and prunes the Chromium HTTP disk cache. `before-quit` runs on
// every quit path (menu-quit on macOS bypasses window-all-closed), so
// this is the correct hook for blocking cleanup.
let isQuitting = false;
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();

  try {
    if (scaleService && typeof scaleService.close === 'function') {
      await scaleService.close();
    }
  } catch (err) {
    logger.warn('[shutdown] scale.close failed:', err && err.message);
  }

  if (ibjaTimer) { clearTimeout(ibjaTimer); ibjaTimer = null; }

  try {
    if (pool) await pool.end();
  } catch (err) {
    logger.warn('[shutdown] pool.end failed:', err && err.message);
  } finally {
    pool = null;
  }

  try {
    sqliteDb.closeDatabase();
  } catch (err) {
    logger.warn('[shutdown] sqlite close failed:', err && err.message);
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.webContents.session.clearCache();
    } else {
      await session.defaultSession.clearCache();
    }
  } catch (err) {
    logger.warn('[shutdown] clearCache failed:', err && err.message);
  }

  // Drop every IPC handler so a lingering renderer reload during quit
  // doesn't re-enter a partially-torn-down handler chain.
  try { ipcMain.removeAllListeners(); } catch (_) { /* ignore */ }

  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

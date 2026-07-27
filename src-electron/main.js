/**
 * Electron main process entrypoint.
 *
 * This file owns:
 *   - the BrowserWindow lifecycle (splash + main window)
 *   - the embedded SQLite database (better-sqlite3, via ./db)
 *   - the electron-store instance
 *   - bcryptjs password hashing/compare
 *   - filesystem I/O for customer / product / user images
 *   - a small set of misc app helpers (relaunch, close-splash, logger)
 *
 * The renderer never touches any of these directly. It talks to us through
 * the channels registered here, exposed by src-electron/preload.js as
 * `window.electronAPI.*`. This is what makes `contextIsolation: true`,
 * `nodeIntegration: false`, and `webSecurity: true` viable.
 *
 * Data access: the renderer sends `call <proc>(?)` strings through db:execute
 * (and a handful of named channels). ./db/router maps every proc to its
 * better-sqlite3 implementation. There is no MySQL/mysql2 anymore.
 */

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const ElectronStore = require('electron-store');
const logger = require('electron-log');

// SQLite data layer. All stored procedures are ported to better-sqlite3 and
// dispatched by db/router.js; there is no legacy pool fallback.
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
// electron-store (owned by main; renderer talks to it over IPC)
// ---------------------------------------------------------------------------
const store = new ElectronStore();

// ---------------------------------------------------------------------------
// SQLite access helpers
// ---------------------------------------------------------------------------

/** undefined -> null at the IPC boundary (better-sqlite3 rejects undefined). */
function nnull(v) { return v === undefined ? null : v; }
function sanitize(params) { return Array.isArray(params) ? params.map(nnull) : []; }

/**
 * Runs a registered stored-procedure implementation by name and returns the
 * mysql2-shaped envelope the renderer's flatten layer expects. Used by the
 * named IPC channels (which know the proc up front).
 */
function proc(name, params) {
  const res = sqliteRouter.runProc(name, sanitize(params), () => sqliteDb.getDb());
  if (res === undefined) {
    throw new Error(`No SQLite implementation registered for proc '${name}'`);
  }
  return res;
}

/**
 * Defensive fallback for any raw SQL the renderer might still send through
 * db:execute / db:query that is NOT a registered `call proc()`. Runs it
 * directly against SQLite and wraps the result in the same envelope. (In
 * practice the renderer only sends registered procs.)
 */
function rawExec(sql, binds) {
  const db = sqliteDb.getDb();
  const stmt = db.prepare(sql);
  const args = sanitize(binds);
  if (stmt.reader) {
    return [args.length ? stmt.all(...args) : stmt.all(), sqliteRouter.SENTINEL];
  }
  args.length ? stmt.run(...args) : stmt.run();
  return [[], sqliteRouter.SENTINEL];
}

/**
 * Shared routing for the generic db:execute / db:query channels. The renderer
 * sends `call <proc>(?)` through BOTH (db:query for the param-less dashboard
 * procs, db:execute for parameterised ones), so both must resolve against the
 * SQLite proc registry; anything else is treated as raw SQL.
 */
function routeSql(sql, values) {
  if (sqliteRouter.isHandled(sql)) {
    try {
      return sqliteRouter.tryExecute(sql, sanitize(values), () => sqliteDb.getDb());
    } catch (err) {
      logger.error(`[db] sqlite proc failed (${sqliteRouter.procName(sql)}):`, err);
      throw err;
    }
  }
  return rawExec(sql, values);
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
  // db:initialize is now a no-op: the SQLite handle is opened at startup and
  // needs no credentials. Kept so the renderer's existing bootstrap path
  // (which still calls it) keeps working unchanged.
  ipcMain.handle('db:initialize', async () => ({ ok: true }));

  ipcMain.handle('db:execute', async (_event, sql, values) => routeSql(sql, values));

  ipcMain.handle('db:query', async (_event, sql) => routeSql(sql, []));

  // -- Metal rates ---------------------------------------------------------
  ipcMain.handle('metalRates:getCurrent', async () => proc('get_current_metal_rates', []));

  ipcMain.handle('metalRates:save', async (_event, payload) => proc('save_metal_rates', [
    payload?.effectiveDate,
    payload?.session,
    payload?.source ?? 'manual',
    payload?.setByUserId ?? null,
    JSON.stringify(payload?.rates ?? []),
  ]));

  // -- Shop settings -------------------------------------------------------
  ipcMain.handle('shopSettings:get', async () => proc('get_shop_settings', []));

  ipcMain.handle('shopSettings:save', async (_event, payload) => proc('save_shop_settings', [
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
  ]));

  // -- Old-gold receipts ---------------------------------------------------
  ipcMain.handle('oldGold:saveReceipt', async (_event, payload) => proc('save_old_gold_receipt', [
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
  ]));

  ipcMain.handle('oldGold:getReceiptsByCustomer', async (_event, customerGuid) =>
    proc('get_old_gold_receipts_by_customer', [customerGuid]));

  ipcMain.handle('oldGold:getReceiptByInvoice', async (_event, invoiceGuid) =>
    proc('get_old_gold_receipt_by_invoice', [invoiceGuid]));

  // -- Saving schemes ------------------------------------------------------
  ipcMain.handle('savingSchemes:enroll', async (_event, payload) => proc('enroll_saving_scheme', [
    payload?.customerGuid,
    payload?.planName,
    payload?.monthlyAmount,
    payload?.tenureMonths ?? 11,
    payload?.bonusInstallments ?? 1,
    payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('savingSchemes:recordInstallment', async (_event, payload) => proc('record_scheme_installment', [
    payload?.schemeGuid,
    payload?.amount,
    payload?.paymentMode,
    payload?.refNumber ?? null,
    payload?.receiptDate ?? null,
    payload?.actorUserId ?? null,
    payload?.allowMultipleThisMonth ? 1 : 0,
  ]));

  ipcMain.handle('savingSchemes:redeem', async (_event, payload) => proc('redeem_saving_scheme', [
    payload?.schemeGuid, payload?.invoiceGuid, payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('savingSchemes:forfeit', async (_event, payload) => proc('forfeit_saving_scheme', [
    payload?.schemeGuid, payload?.reason, payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('savingSchemes:getDetails', async (_event, schemeGuid) =>
    proc('get_saving_scheme_details', [schemeGuid]));

  ipcMain.handle('savingSchemes:getAll', async (_event, args) => proc('get_all_saving_schemes', [
    args?.itemsPerPage ?? 20,
    args?.pageNumber ?? 1,
    args?.statusFilter ?? null,
    args?.searchQuery ?? '',
  ]));

  ipcMain.handle('savingSchemes:getByCustomer', async (_event, customerGuid) =>
    proc('get_saving_schemes_by_customer', [customerGuid]));

  // -- Karigar -------------------------------------------------------------
  ipcMain.handle('karigar:addKarigar', async (_event, payload) => proc('add_karigar', [
    payload?.name, payload?.phone ?? null, payload?.address ?? null,
    payload?.remarks ?? null, payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('karigar:getAllKarigars', async (_event, args) => proc('get_all_karigars', [
    args?.itemsPerPage ?? 20, args?.pageNumber ?? 1, args?.searchQuery ?? '',
  ]));

  ipcMain.handle('karigar:updateKarigar', async (_event, payload) => proc('update_karigar', [
    payload?.karigarGuid, payload?.name, payload?.phone ?? null,
    payload?.address ?? null, payload?.remarks ?? null, payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('karigar:deleteKarigar', async (_event, args) => proc('delete_karigar', [
    args?.karigarGuid, args?.actorUserId ?? null,
  ]));

  ipcMain.handle('karigar:issueJob', async (_event, payload) => proc('issue_karigar_job', [
    payload?.karigarGuid,
    payload?.issueDate ?? null,
    payload?.issuedGrossWeight,
    payload?.issuedPurityCode ?? null,
    payload?.issuedStones ? JSON.stringify(payload.issuedStones) : null,
    payload?.expectedReturnDate ?? null,
    payload?.description ?? null,
    payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('karigar:receiveJob', async (_event, payload) => proc('receive_karigar_job', [
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
  ]));

  ipcMain.handle('karigar:settleJob', async (_event, payload) => proc('settle_karigar_job', [
    payload?.jobGuid, payload?.settlementAmount, payload?.paymentMode,
    payload?.refNumber ?? null, payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('karigar:getJobDetails', async (_event, jobGuid) =>
    proc('get_karigar_job_card_details', [jobGuid]));

  ipcMain.handle('karigar:getAllJobs', async (_event, args) => proc('get_all_karigar_jobs', [
    args?.itemsPerPage ?? 20, args?.pageNumber ?? 1,
    args?.karigarGuid ?? null, args?.statusFilter ?? null,
  ]));

  ipcMain.handle('karigar:getLedger', async (_event, args) => proc('get_karigar_ledger', [
    args?.karigarGuid, args?.dateFrom ?? null, args?.dateTo ?? null,
  ]));

  // -- Reports -------------------------------------------------------------
  ipcMain.handle('reports:dayBook', async (_event, args) =>
    proc('get_day_book', [args?.dateFrom, args?.dateTo]));

  ipcMain.handle('reports:salesRegister', async (_event, args) => proc('get_sales_register', [
    args?.dateFrom, args?.dateTo, args?.customerGuid ?? null, args?.statusFilter ?? null,
  ]));

  ipcMain.handle('reports:stockSummaryByPurity', async (_event, args) =>
    proc('get_stock_summary_by_purity', [args?.asOfDate ?? null]));

  ipcMain.handle('reports:gstr1Export', async (_event, args) =>
    proc('get_gstr1_export_rows', [args?.monthYear ?? null]));

  ipcMain.handle('reports:lowStockByCategory', async (_event, args) =>
    proc('get_low_stock_by_category', [args?.thresholdCount ?? 3]));

  // -- Auth: user permissions ---------------------------------------------
  ipcMain.handle('auth:getUserPermissions', async (_event, userId) =>
    proc('get_user_permissions', [userId]));

  // -- Backup + restore ----------------------------------------------------
  function currentBackupDir(argDir) {
    if (typeof argDir === 'string' && argDir.length) { return argDir; }
    try {
      const row = sqliteDb.getDb().prepare('SELECT backupDir FROM shopsettings WHERE id = 1').get();
      if (row && row.backupDir) { return row.backupDir; }
    } catch (_) { /* fall through */ }
    return path.join(app.getPath('userData'), 'backups');
  }

  ipcMain.handle('backup:create', async (_event, payload) => {
    const dir = currentBackupDir(payload?.targetDir);
    try {
      const result = await getBackupService().createBackup(
        sqliteDb.resolveDbPath(), payload?.passphrase, dir);
      return { ok: true, result };
    } catch (err) {
      logger.error('[backup:create] failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restore', async (_event, payload) => {
    const dbPath = sqliteDb.resolveDbPath();
    try {
      // Close the live handle so the file can be swapped, then reopen. The
      // renderer typically triggers app:relaunch after a successful restore.
      sqliteDb.closeDatabase();
      await getBackupService().restoreBackup(dbPath, payload?.archivePath, payload?.passphrase);
      sqliteDb.initDatabase();
      return { ok: true };
    } catch (err) {
      logger.error('[backup:restore] failed:', err);
      try { sqliteDb.initDatabase(); } catch (_) { /* best effort reopen */ }
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:list', async (_event, payload) => {
    const dir = currentBackupDir(payload?.backupDir);
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
  ipcMain.handle('scale:getStatus', async () => getScaleService().status());

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

  ipcMain.handle('scale:getReading', async () => getScaleService().getReading());

  // -- Repair tickets ------------------------------------------------------
  ipcMain.handle('repair:create', async (_event, payload) => proc('create_repair_ticket', [
    payload?.customerGuid,
    payload?.receivedByUserId ?? null,
    payload?.itemDescription,
    payload?.itemPhotoPath ?? null,
    payload?.weight ?? null,
    payload?.estimatedCharge ?? null,
    payload?.estimatedReturnDate ?? null,
    payload?.notes ?? null,
    payload?.karigarGuid ?? null,
  ]));

  ipcMain.handle('repair:updateStatus', async (_event, payload) => proc('update_repair_status', [
    payload?.ticketGuid,
    payload?.newStatus,
    payload?.actorUserId ?? null,
    payload?.actualCharge ?? null,
    payload?.paymentMode ?? null,
    payload?.paymentRef ?? null,
  ]));

  ipcMain.handle('repair:settle', async (_event, payload) => proc('settle_repair_ticket', [
    payload?.ticketGuid,
    payload?.actualCharge,
    payload?.paymentMode,
    payload?.paymentRef ?? null,
    payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('repair:linkToKarigar', async (_event, payload) => proc('link_repair_to_karigar', [
    payload?.ticketGuid,
    payload?.karigarGuid,
    payload?.karigarJobGuid ?? null,
    payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('repair:getDetails', async (_event, ticketGuid) =>
    proc('get_repair_ticket_details', [ticketGuid]));

  ipcMain.handle('repair:getAll', async (_event, args) => proc('get_all_repair_tickets', [
    args?.status ?? null,
    args?.customerSearch ?? null,
    args?.dateFrom ?? null,
    args?.dateTo ?? null,
    args?.pageSize ?? 20,
    args?.page ?? 1,
  ]));

  ipcMain.handle('repair:getByCustomer', async (_event, customerGuid) =>
    proc('get_repair_tickets_by_customer', [customerGuid]));

  ipcMain.handle('repair:delete', async (_event, payload) => proc('delete_repair_ticket', [
    payload?.ticketGuid, payload?.actorUserId ?? null,
  ]));

  // -- WhatsApp -----------------------------------------------------------
  function readWhatsappConfig() {
    try {
      return sqliteDb.getDb().prepare(
        'SELECT whatsappPhoneNumberId, whatsappBusinessAccountId, whatsappApiToken, whatsappEnabled '
        + 'FROM shopsettings WHERE id = 1'
      ).get() || null;
    } catch (_) {
      return null;
    }
  }

  ipcMain.handle('whatsapp:send', async (_event, payload) => {
    const cfg = readWhatsappConfig();
    if (!cfg || !cfg.whatsappEnabled) {
      return { ok: false, error: 'not_configured' };
    }

    // Queue the send row first so we always have an audit trail.
    let sendGuid = null;
    try {
      const queued = proc('queue_whatsapp_send', [
        payload?.invoiceGuid ?? null,
        payload?.customerGuid,
        payload?.templateName,
        payload?.templateLanguage ?? 'en',
        payload?.templateVariables ? JSON.stringify(payload.templateVariables) : null,
        payload?.attachmentUrl ?? null,
        payload?.phoneNumber,
        payload?.sentByUserId ?? null,
      ]);
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
        proc('update_whatsapp_status', [
          sendGuid,
          apiResult.ok ? 'sent' : 'failed',
          apiResult.messageId ?? null,
          apiResult.ok ? null : (apiResult.error || 'unknown'),
          payload?.sentByUserId ?? null,
        ]);
      } catch (err) {
        logger.error('[whatsapp:send] update_whatsapp_status failed:', err);
      }
    }

    return apiResult.ok
      ? { ok: true, sendGuid, messageId: apiResult.messageId }
      : { ok: false, sendGuid, error: apiResult.error };
  });

  ipcMain.handle('whatsapp:updateStatus', async (_event, payload) => proc('update_whatsapp_status', [
    payload?.sendGuid,
    payload?.newStatus,
    payload?.metaMessageId ?? null,
    payload?.errorMessage ?? null,
    payload?.actorUserId ?? null,
  ]));

  ipcMain.handle('whatsapp:getLog', async (_event, args) => proc('get_whatsapp_send_log', [
    args?.customerGuid ?? null,
    args?.status ?? null,
    args?.dateFrom ?? null,
    args?.dateTo ?? null,
    args?.pageSize ?? 20,
    args?.page ?? 1,
  ]));

  ipcMain.handle('whatsapp:getByCustomer', async (_event, customerGuid) =>
    proc('get_whatsapp_sends_by_customer', [customerGuid]));

  ipcMain.handle('whatsapp:getByInvoice', async (_event, invoiceGuid) =>
    proc('get_whatsapp_sends_by_invoice', [invoiceGuid]));

  // -- IBJA (rate scraper + snapshot log) ----------------------------------
  ipcMain.handle('ibja:fetchNow', async () => runIbjaFetchAndSave());

  ipcMain.handle('ibja:getSnapshots', async (_event, args) => proc('get_ibja_snapshots', [
    args?.status ?? null,
    args?.dateFrom ?? null,
    args?.dateTo ?? null,
    args?.pageSize ?? 20,
    args?.page ?? 1,
  ]));

  ipcMain.handle('ibja:getScheduleInfo', () => ibjaScheduleInfo());

  // -- Store -----------------------------------------------------------------
  ipcMain.handle('store:get',    (_event, key)        => store.get(key));
  ipcMain.handle('store:set',    (_event, key, value) => { store.set(key, value); return true; });
  ipcMain.handle('store:delete', (_event, key)        => { store.delete(key); return true; });

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
  try { sqliteDb.getDb(); } catch (_) { return { ok: false, error: 'db_not_initialised' }; }
  const now = new Date();
  const result = await getIbjaService().fetchIbjaRates(now);

  const istTotal = now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN;
  const istHour  = Math.floor((istTotal % (24 * 60)) / 60);
  const session  = result.session || (istHour < 14 ? 'AM' : 'PM');

  try {
    if (result.ok) {
      proc('save_ibja_snapshot', [session, result.rawResponse ?? '', 'success', null]);
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
          proc('save_metal_rates', [nowDate, session, 'ibja', null, JSON.stringify(ratesArray)]);
        } catch (rateErr) {
          logger.error('[ibja] save_metal_rates failed:', rateErr);
        }
      }
      return { ok: true, session, purities };
    }
    proc('save_ibja_snapshot', [
      session,
      result.rawResponse ?? '',
      result.reason || 'network_error',
      result.error || null,
    ]);
    return { ok: false, error: result.error || result.reason };
  } catch (err) {
    logger.error('[ibja] run failed:', err);
    return { ok: false, error: err.message };
  }
}

async function scheduleNextIbjaFire() {
  let enabled = false;
  try {
    const row = sqliteDb.getDb().prepare(
      'SELECT ibjaAutoFetchEnabled FROM shopsettings WHERE id = 1'
    ).get();
    enabled = !!(row && row.ibjaAutoFetchEnabled);
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
  // Open the SQLite handle (create file + run migrations) before registering
  // handlers so the very first IPC call has a live database.
  try {
    sqliteDb.initDatabase();
  } catch (err) {
    logger.error('[db] SQLite initialisation failed:', err);
  }

  registerIpcHandlers();
  createWindow();

  // DB is ready synchronously; schedule the IBJA auto-fetch directly.
  scheduleNextIbjaFire().catch((err) =>
    logger.warn('[ibja] initial schedule failed:', err.message));
});

// Consolidated shutdown: closes serialport, clears IBJA timer, closes the
// SQLite handle, and prunes the Chromium HTTP disk cache. `before-quit` runs
// on every quit path (menu-quit on macOS bypasses window-all-closed), so this
// is the correct hook for blocking cleanup.
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

/**
 * electron-builder afterPack hook.
 *
 * Strips Chromium's bundled locale .pak files down to en-US. These are
 * Chromium's own UI translations (context menus, etc.) — the app's Angular
 * i18n is separate — and Chromium falls back to en-US, so removing the rest is
 * a standard, safe size win (~45 MB across ~55 unused .pak files).
 */
const fs = require('fs');
const path = require('path');

const KEEP = new Set(['en-US.pak']);

exports.default = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  let removed = 0;
  let freed = 0;
  try {
    for (const file of fs.readdirSync(localesDir)) {
      if (file.endsWith('.pak') && !KEEP.has(file)) {
        const full = path.join(localesDir, file);
        freed += fs.statSync(full).size;
        fs.unlinkSync(full);
        removed += 1;
      }
    }
    console.log(`[afterPack] removed ${removed} Chromium locale paks (${(freed / 1048576).toFixed(1)} MB freed)`);
  } catch (err) {
    console.warn('[afterPack] locale prune skipped:', err.message);
  }
};

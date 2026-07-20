/**
 * Weighing-scale integration for Electron main process.
 *
 * Digital jewellery scales are typically RS-232 (older) or USB-HID
 * keyboard-wedge (newer). This module handles the RS-232 path via
 * `serialport`. HID keyboard-wedge scales are handled entirely in the
 * renderer as a focus target — they type the weight into whatever input
 * has focus. See `Alt+W` handling in the cart-builder.
 *
 * We deliberately tolerate a missing `serialport` module: on Windows
 * boxes without a build toolchain the native binding can fail to load.
 * When that happens we expose an inert factory + `available = false`
 * flag so the renderer can gracefully disable the scale UI.
 *
 * Frame parsing assumes a stream that includes a numeric weight (grams)
 * with up to 3 decimals; some scales embed status flags (S = stable,
 * US = unstable) which we key off to set `stable`. When no flags are
 * present we heuristically flag `stable = true` after two identical
 * consecutive readings within 500 ms.
 */

const logger = require('electron-log');

let SerialPort = null;
let ReadlineParser = null;
let available = false;

try {
  // eslint-disable-next-line global-require
  ({ SerialPort } = require('serialport'));
  // eslint-disable-next-line global-require
  ({ ReadlineParser } = require('@serialport/parser-readline'));
  available = true;
} catch (err) {
  logger.warn('[scale] `serialport` unavailable; scale integration disabled.', err && err.message);
  available = false;
}

const STABLE_HOLD_MS = 500;
const NUMERIC_RE = /-?\d+(?:\.\d{1,3})?/;

let currentPort = null;
let currentParser = null;
let lastReading = null;
let lastNumericValue = null;
let lastNumericAt = 0;
let stableFromRepeats = false;

function parseFrame(raw) {
  if (typeof raw !== 'string') { return null; }
  const trimmed = raw.trim();
  if (!trimmed) { return null; }
  const match = trimmed.match(NUMERIC_RE);
  if (!match) { return null; }
  const grams = Number(match[0]);
  if (!Number.isFinite(grams)) { return null; }

  const upper = trimmed.toUpperCase();
  let stable = null;
  if (/\bST\b|\bS\b|STABLE/.test(upper))  { stable = true; }
  if (/\bUS\b|UNSTABLE/.test(upper))       { stable = false; }
  return { grams, stableFlag: stable, raw: trimmed };
}

async function listPorts() {
  if (!available || !SerialPort) { return []; }
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || null,
      serialNumber: p.serialNumber || null,
      vendorId: p.vendorId || null,
      productId: p.productId || null,
      friendlyName: p.friendlyName || null,
    }));
  } catch (err) {
    logger.error('[scale] listPorts failed:', err);
    return [];
  }
}

function isOpen() {
  return !!(currentPort && currentPort.isOpen);
}

async function close() {
  return new Promise((resolve) => {
    if (!currentPort) { resolve(); return; }
    const p = currentPort;
    currentPort = null;
    currentParser = null;
    try {
      if (p.isOpen) {
        p.close((err) => {
          if (err) { logger.warn('[scale] close error:', err.message); }
          resolve();
        });
      } else {
        resolve();
      }
    } catch (err) {
      logger.warn('[scale] close threw:', err.message);
      resolve();
    }
  });
}

async function open(portPath, baudRate, onReading) {
  if (!available || !SerialPort) {
    throw new Error('serialport module is not available on this machine');
  }
  if (isOpen()) { await close(); }
  lastReading = null;
  lastNumericValue = null;
  lastNumericAt = 0;
  stableFromRepeats = false;

  return new Promise((resolve, reject) => {
    try {
      const port = new SerialPort({
        path: portPath,
        baudRate: Number(baudRate) || 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
      });
      const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      port.open((err) => {
        if (err) {
          logger.error('[scale] open failed:', err);
          reject(err);
          return;
        }
        currentPort = port;
        currentParser = parser;
        resolve({ ok: true, path: portPath, baudRate: Number(baudRate) || 9600 });
      });

      parser.on('data', (line) => {
        const parsed = parseFrame(String(line));
        if (!parsed) { return; }
        const now = Date.now();
        let stable = parsed.stableFlag;
        if (stable === null) {
          if (lastNumericValue !== null && Math.abs(lastNumericValue - parsed.grams) < 0.001) {
            if (!stableFromRepeats && (now - lastNumericAt) >= STABLE_HOLD_MS) {
              stableFromRepeats = true;
            }
            stable = stableFromRepeats;
          } else {
            stableFromRepeats = false;
            stable = false;
            lastNumericAt = now;
          }
          lastNumericValue = parsed.grams;
        }
        const reading = {
          grams: parsed.grams,
          stable: !!stable,
          raw: parsed.raw,
          receivedAt: new Date(now).toISOString(),
        };
        lastReading = reading;
        if (typeof onReading === 'function') { onReading(reading); }
      });

      port.on('error', (err) => {
        logger.error('[scale] port error:', err && err.message);
      });

      port.on('close', () => {
        if (currentPort === port) {
          currentPort = null;
          currentParser = null;
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function getReading() {
  if (!isOpen()) { return null; }
  return lastReading;
}

function status() {
  return {
    available,
    isOpen: isOpen(),
    path: currentPort?.path ?? null,
    baudRate: currentPort?.baudRate ?? null,
    lastReading,
  };
}

module.exports = {
  get available() { return available; },
  listPorts,
  open,
  close,
  getReading,
  status,
  parseFrame,
};

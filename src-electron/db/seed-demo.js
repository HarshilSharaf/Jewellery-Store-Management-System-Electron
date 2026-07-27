/**
 * Demo / dev data seeder — NOT for production installs.
 *
 * Usage:
 *   node src-electron/db/seed-demo.js            # small set (default)
 *   node src-electron/db/seed-demo.js large      # busy set for reports/dashboards
 *   ZEUS_DB_PATH=/path/to/app.db node src-electron/db/seed-demo.js
 *
 * Writes THROUGH the ported stored-procedure functions (add_customer,
 * add_product, save_order, record_payment, enroll_saving_scheme, add_karigar,
 * create_repair_ticket, ...) so it respects the integer paise/mg money model,
 * GUID generation, invoice counters, isSold flips and audit rows — and doubles
 * as an end-to-end smoke test of the SQLite data layer.
 *
 * Target DB: ZEUS_DB_PATH if set (the app honours it too), else ./demo.db in
 * the current working directory. Launch the app against the same file:
 *   ZEUS_DB_PATH=<abs>/demo.db npm run electron
 *
 * Determinism: a fixed-seed PRNG so re-runs on a fresh DB are identical.
 * Meant for a FRESH demo DB; re-running appends more data.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const procs = require('./procedures');

// ---- config ---------------------------------------------------------------
const SIZE = /large/i.test(process.argv.slice(2).join(' ')) || /large/i.test(process.env.SEED_SIZE || '')
  ? 'large' : 'small';
const N = SIZE === 'large'
  ? { customers: 100, products: 800, orders: 250, karigars: 12, jobs: 20, schemes: 15, repairs: 30 }
  : { customers: 15, products: 60, orders: 25, karigars: 3, jobs: 3, schemes: 3, repairs: 4 };

// Anchored to this file (not cwd) so it matches the app's dev default
// (db/index.js DEV_DB_PATH) regardless of where the script is launched from.
const DB_PATH = process.env.ZEUS_DB_PATH || path.join(__dirname, '..', '..', 'demo.db');
const SCHEMA_DIR = path.join(__dirname, 'schema');

// Metal rates (rupees per gram) used both for the metalrates table and to
// price line items consistently.
const RATES = { 999: 7400, 995: 7370, 916: 6780, 875: 6480, 750: 5550, 585: 4330, S999: 92, P950: 3200 };

// ---- deterministic PRNG (mulberry32) --------------------------------------
let _s = 0x9e3779b9;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
function isoDaysAgo(days) {
  // No Date.now() restriction here (plain node script); build a UTC stamp.
  const d = new Date(Date.now() - days * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ---- envelope helpers (proc fns return arrays of result sets) -------------
const firstRow = (sets) => (sets && sets[0] && sets[0][0]) ? sets[0][0] : null;

// ---- schema bootstrap (mirrors db/index.js migration runner) --------------
function ensureSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  let v = db.pragma('user_version', { simple: true });
  if (v < 1) {
    db.exec(fs.readFileSync(path.join(SCHEMA_DIR, '001_baseline.sql'), 'utf8'));
    if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
      db.prepare(
        `INSERT INTO users (userName, email, password, type, permissions)
         VALUES ('admin','admin@localhost',?, 'admin', NULL)`
      ).run(bcrypt.hashSync('admin', 10));
    }
    db.pragma('user_version = 1');
    v = 1;
  }
  if (v < 2) {
    db.exec(fs.readFileSync(path.join(SCHEMA_DIR, '002_p2_tables.sql'), 'utf8'));
    db.pragma('user_version = 2');
  }
}

// ---- data pools -----------------------------------------------------------
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Meera', 'Diya', 'Ananya', 'Rohan', 'Isha', 'Kabir', 'Priya',
  'Arjun', 'Saanvi', 'Reyansh', 'Anaya', 'Vihaan', 'Riya', 'Krishna', 'Myra', 'Ishaan', 'Aadhya'];
const LAST = ['Sharma', 'Patel', 'Iyer', 'Reddy', 'Nair', 'Gupta', 'Shah', 'Rao', 'Mehta', 'Joshi', 'Desai'];
const CITIES = [['Mumbai', 'Maharashtra', '27'], ['Pune', 'Maharashtra', '27'], ['Surat', 'Gujarat', '24'],
  ['Jaipur', 'Rajasthan', '08'], ['Chennai', 'Tamil Nadu', '33']];
const MASTERS = [['Gold', 'Gold jewellery'], ['Silver', 'Silver jewellery'], ['Platinum', 'Platinum jewellery'], ['Diamond', 'Diamond-studded']];
const PRODCATS = ['Chain', 'Ring', 'Earring', 'Bangle', 'Pendant', 'Bracelet', 'Anklet', 'Coin'];
const SUBCATS = ['Plain', 'Antique', 'Studded', 'Temple', 'Modern'];
const GOLD_PURITIES = ['916', '916', '916', '750', '585', '999'];
const PAY_MODES = ['cash', 'upi', 'card', 'online'];

function seed() {
  const db = new Database(DB_PATH);
  ensureSchema(db);
  const admin = db.prepare("SELECT uid FROM users WHERE userName='admin'").get();
  const adminUid = admin ? admin.uid : null;
  const log = (m) => process.stdout.write(m + '\n');
  log(`Seeding ${SIZE} demo set into ${DB_PATH}`);

  // -- shop settings (singleton id=1) --------------------------------------
  // Required: save_order / create_repair_ticket read + increment the invoice
  // and repair counters from this row; without it every number would collide.
  procs.save_shop_settings(db, [
    'Radiance Jewellers', '27ABCDE1234F1Z5', 'ABCDE1234F',
    'Shop 12, Zaveri Bazaar', 'Kalbadevi Road', 'Mumbai', 'Maharashtra', '27',
    '400002', '022-23401122', 'contact@radiance.example', null,
    'INV/', 1, 1, 'INR', 'Asia/Kolkata', 1, null, 'a4', 'editorial', adminUid,
  ]);

  // -- metal rates ----------------------------------------------------------
  const today = isoDaysAgo(0).slice(0, 10);
  procs.save_metal_rates(db, [today, 'AM', 'manual', adminUid,
    JSON.stringify(Object.entries(RATES).map(([purityCode, ratePerGram]) => ({ purityCode, ratePerGram })))]);

  // -- categories (via procs, then read back ids) ---------------------------
  for (const [name, desc] of MASTERS) procs.add_master_category(db, [name, desc]);
  for (const name of PRODCATS) procs.add_product_category(db, [name, `${name}s`]);
  for (const name of SUBCATS) procs.add_sub_category(db, [name, `${name} styles`]);
  const masterId = {};
  for (const r of db.prepare('SELECT id, masterCategoryName n FROM mastercategories').all()) masterId[r.n] = r.id;
  const prodCatIds = db.prepare('SELECT id FROM productcategories').all().map((r) => r.id);
  const subCatIds = db.prepare('SELECT id FROM subcategories').all().map((r) => r.id);

  // -- customers ------------------------------------------------------------
  const customers = [];
  for (let i = 0; i < N.customers; i++) {
    const fn = pick(FIRST); const ln = pick(LAST); const [city, state, sc] = pick(CITIES);
    const row = firstRow(procs.add_customer(db, [
      fn, ln, null, pick(['male', 'female']), `${ri(1, 999)} Bazaar Rd`, city, state, sc,
      `${fn.toLowerCase()}.${ln.toLowerCase()}.${i}@example.com`,
      `9${ri(100000000, 999999999)}`, null, null, null, null,
    ]));
    if (row) customers.push(row);
  }

  // -- products -------------------------------------------------------------
  const products = [];
  for (let i = 0; i < N.products; i++) {
    const metal = rnd() < 0.72 ? 'Gold' : rnd() < 0.6 ? 'Silver' : rnd() < 0.5 ? 'Platinum' : 'Diamond';
    const purityCode = metal === 'Silver' ? 'S999' : metal === 'Platinum' ? 'P950' : pick(GOLD_PURITIES);
    const netWeight = round2(ri(15, 600) / 10); // 1.5 - 60 g
    const stoneWeight = metal === 'Diamond' ? round2(ri(1, 20) / 10) : 0;
    const grossWeight = round2(netWeight + stoneWeight);
    const makingValue = ri(300, 900); // per gram
    const rate = RATES[purityCode];
    const tagPrice = round2(rate * netWeight + makingValue * netWeight + stoneWeight * 5000);
    const cat = pick(PRODCATS);
    const row = firstRow(procs.add_product(db, [
      `SKU-${SIZE[0].toUpperCase()}${1000 + i}`, null, purityCode, `${metal} ${cat}`,
      grossWeight, netWeight, stoneWeight, stoneWeight ? ri(2000, 20000) : 0,
      'perGram', makingValue, 0, round2(tagPrice * 0.9), tagPrice, '7113',
      masterId[metal], pick(subCatIds), pick(prodCatIds), null,
    ]));
    if (row) {
      products.push({
        id: row.id, purityCode, netWeight, grossWeight, stoneWeight, makingValue,
        stoneCharge: stoneWeight ? Number(row.stoneCharges) : 0, name: `${metal} ${cat}`,
      });
    }
  }

  // shuffle products (deterministic) so orders consume distinct unsold items
  for (let i = products.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [products[i], products[j]] = [products[j], products[i]]; }

  // -- orders ---------------------------------------------------------------
  // Only sell into ~60% of the catalogue so plenty of stock stays unsold for
  // the inventory screen and for creating fresh orders in the demo.
  const maxConsume = Math.floor(products.length * 0.6);
  let orderOk = 0; let orderErr = 0; let paymentsAdded = 0; let cursor = 0;
  for (let i = 0; i < N.orders && cursor < maxConsume; i++) {
    const cust = pick(customers);
    const nLines = Math.min(ri(1, 3), maxConsume - cursor);
    const lineItems = [];
    let subTotal = 0; let cgst = 0; let sgst = 0; let making = 0; let stone = 0; let grand = 0;
    for (let k = 0; k < nLines; k++) {
      const p = products[cursor++];
      const rate = RATES[p.purityCode];
      const metalValue = round2(rate * p.netWeight);
      const mk = round2(p.makingValue * p.netWeight);
      const taxable = round2(metalValue + mk + p.stoneCharge);
      const lc = round2(taxable * 0.015);
      const lineTotal = round2(taxable + lc * 2);
      subTotal = round2(subTotal + taxable); cgst = round2(cgst + lc); sgst = round2(sgst + lc);
      making = round2(making + mk); stone = round2(stone + p.stoneCharge); grand = round2(grand + lineTotal);
      lineItems.push({
        productId: p.id, lineType: 'product', description: p.name, hsnCode: '7113', purityCode: p.purityCode,
        grossWeight: p.grossWeight, netWeight: p.netWeight, stoneWeight: p.stoneWeight,
        ratePerGram: rate, metalValue, makingCharge: mk, stoneCharge: p.stoneCharge, wastageCharge: 0,
        discountAmount: 0, taxableAmount: taxable, cgst: lc, sgst: lc, igst: 0, lineTotal,
      });
    }
    const payRoll = rnd();
    const amountPaid = payRoll < 0.7 ? grand : payRoll < 0.9 ? round2(grand * 0.5) : 0;
    const res = firstRow(procs.save_order(db, [
      cust.id, cust.state || 'Maharashtra', '7113', null,
      subTotal, cgst, sgst, 0, 0, making, stone, 0, 0, 0, grand, null,
      amountPaid > 0 ? amountPaid : null, amountPaid > 0 ? pick(PAY_MODES) : null, null,
      JSON.stringify(lineItems), JSON.stringify([]), null, null, adminUid,
    ]));
    if (res && res.invoiceGuid) {
      orderOk++;
      // back-date for report/dashboard history
      const when = isoDaysAgo(ri(0, 175));
      db.prepare('UPDATE invoices SET createdAt = ? WHERE invoiceGuid = ?').run(when, res.invoiceGuid);
      db.prepare('UPDATE payments SET receivedOn = ? WHERE invoiceId = (SELECT id FROM invoices WHERE invoiceGuid = ?)').run(when, res.invoiceGuid);
      // clear a partial balance via record_payment (exercises that path)
      if (amountPaid > 0 && amountPaid < grand) {
        procs.record_payment(db, [res.invoiceGuid, pick(PAY_MODES), null, 'Balance settled', round2(grand - amountPaid), when]);
        paymentsAdded++;
      }
    } else {
      orderErr++;
      if (orderErr <= 3) log(`  order error: ${res ? res.message : 'no result'}`);
    }
  }

  // -- karigars + jobs ------------------------------------------------------
  const karigars = [];
  for (let i = 0; i < N.karigars; i++) {
    const row = firstRow(procs.add_karigar(db, [`${pick(FIRST)} ${pick(LAST)}`, `9${ri(100000000, 999999999)}`, `${pick(CITIES)[0]} workshop`, null, adminUid]));
    if (row && row.karigarGuid) karigars.push(row.karigarGuid);
  }
  let jobsDone = 0;
  for (let i = 0; i < N.jobs && karigars.length; i++) {
    const issueW = round2(ri(50, 400) / 10);
    const job = firstRow(procs.issue_karigar_job(db, [
      pick(karigars), isoDaysAgo(ri(5, 40)), issueW, pick(GOLD_PURITIES), null, isoDaysAgo(-ri(3, 15)), 'Custom set', adminUid,
    ]));
    if (job && job.jobGuid && rnd() < 0.6) {
      procs.receive_karigar_job(db, [
        job.jobGuid, isoDaysAgo(ri(0, 4)), issueW, round2(issueW * 0.98), 0, 2, round2(issueW * 0.02), ri(1500, 6000), 'Received', adminUid,
      ]);
    }
    if (job && job.jobGuid) jobsDone++;
  }

  // -- saving schemes + installments ---------------------------------------
  let schemesDone = 0;
  for (let i = 0; i < N.schemes && customers.length; i++) {
    const cust = pick(customers);
    const monthly = pick([2000, 3000, 5000]);
    const scheme = firstRow(procs.enroll_saving_scheme(db, [cust.customerGuid, `${monthly}/mo Gold Plan`, monthly, 11, 1, adminUid]));
    if (scheme && scheme.schemeGuid) {
      schemesDone++;
      const paidCount = ri(2, 6);
      for (let m = 0; m < paidCount; m++) {
        // allowMultipleThisMonth=1 so the demo can add several without the monthly-dedupe guard
        procs.record_scheme_installment(db, [scheme.schemeGuid, monthly, pick(PAY_MODES), null, isoDaysAgo((paidCount - m) * 30), adminUid, 1]);
      }
    }
  }

  // -- repair tickets -------------------------------------------------------
  let repairsDone = 0;
  for (let i = 0; i < N.repairs && customers.length; i++) {
    try {
      const cust = pick(customers);
      const t = firstRow(procs.create_repair_ticket(db, [
        cust.customerGuid, adminUid, pick(['Ring resize', 'Chain solder', 'Polish & clean', 'Stone reset']),
        null, round2(ri(20, 300) / 10), ri(200, 1500), isoDaysAgo(-ri(2, 10)), 'Walk-in', null,
      ]));
      if (t && t.ticketGuid) {
        repairsDone++;
        if (rnd() < 0.5) procs.update_repair_status(db, [t.ticketGuid, 'in_progress', adminUid, null, null, null]);
      }
    } catch (e) { log(`  repair skipped: ${e.message}`); }
  }

  db.close();

  log('\nDone.');
  log(`  customers: ${customers.length}`);
  log(`  products:  ${products.length}`);
  log(`  orders:    ${orderOk} ok, ${orderErr} failed  (+${paymentsAdded} balance payments)`);
  log(`  karigars:  ${karigars.length}, jobs: ${jobsDone}`);
  log(`  schemes:   ${schemesDone}, repairs: ${repairsDone}`);
  if (process.env.ZEUS_DB_PATH) {
    log('\nLaunch the app with ZEUS_DB_PATH set to this file in the launching shell:');
    log(`  (PowerShell)  $env:ZEUS_DB_PATH = "${DB_PATH}"; npm run electron`);
  } else {
    log('\nLaunch the dev app (it uses this demo.db automatically):');
    log('  npm run electron');
  }
  log('Login: admin / admin');
}

seed();

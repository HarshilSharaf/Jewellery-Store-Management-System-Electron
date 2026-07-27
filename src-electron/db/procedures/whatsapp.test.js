const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const wa = require('./whatsapp');

const DIR = path.join(__dirname, '..', 'schema');
function flatten(raw) { if (!Array.isArray(raw)) return raw; let o = []; for (const s of raw.slice(0, -1)) if (Array.isArray(s)) o = o.concat(s); return o; }
function envelope(sets) { return [...sets, { __sqliteOk: true }]; }
function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-wa-${process.pid}-${process.hrtime()[1]}.db`);
  const db = new Database(p); db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(DIR, '001_baseline.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(DIR, '002_p2_tables.sql'), 'utf8'));
  db.prepare(`INSERT INTO customers (customerGuid,firstName,lastName,gender,city,phoneNumber) VALUES ('c1','Asha','Rao','female','Pune','999')`).run();
  db._path = p; return db;
}
function cleanup(db) { const p = db._path; db.close(); for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} } }

// queue params: invoiceGuid, customerGuid, templateName, templateLanguage, templateVariablesJson, attachmentUrl, phoneNumber, sentByUserId
test('queue_whatsapp_send: returns sendGuid; unknown customer throws', () => {
  const db = freshDb();
  try {
    const r = flatten(envelope(wa.queue_whatsapp_send(db, [null, 'c1', 'invoice_ready', 'en', '{"1":"INV/1"}', null, '999', null])));
    assert.equal(r[0].sendGuid.length, 36);
    const row = db.prepare('SELECT status, templateVariables FROM whatsappsendlog WHERE sendGuid=?').get(r[0].sendGuid);
    assert.equal(row.status, 'queued');
    assert.equal(row.templateVariables, '{"1":"INV/1"}');
    assert.throws(() => wa.queue_whatsapp_send(db, [null, 'nope', 't', 'en', null, null, '9', null]), /customer not found/);
  } finally { cleanup(db); }
});

test('update_whatsapp_status: stamps sentAt; validates status', () => {
  const db = freshDb();
  try {
    const guid = flatten(envelope(wa.queue_whatsapp_send(db, [null, 'c1', 't', 'en', null, null, '999', null])))[0].sendGuid;
    wa.update_whatsapp_status(db, [guid, 'sent', 'meta-123', null, null]);
    const row = db.prepare('SELECT status, metaMessageId, sentAt FROM whatsappsendlog WHERE sendGuid=?').get(guid);
    assert.equal(row.status, 'sent');
    assert.equal(row.metaMessageId, 'meta-123');
    assert.ok(row.sentAt, 'sentAt stamped');
    assert.throws(() => wa.update_whatsapp_status(db, [guid, 'bogus', null, null, null]), /invalid status/);
  } finally { cleanup(db); }
});

test('get_whatsapp_send_log / by_customer: shapes + customerName', () => {
  const db = freshDb();
  try {
    wa.queue_whatsapp_send(db, [null, 'c1', 't', 'en', null, null, '999', null]);
    const logRaw = wa.get_whatsapp_send_log(db, [null, null, null, null, 10, 1]);
    assert.equal(logRaw.length, 2, 'rows + count');
    const flat = flatten(envelope(logRaw));
    assert.equal(flat.find(r => typeof r.totalRecords === 'number').totalRecords, 1);
    assert.equal(flat.find(r => r.sendGuid).customerName, 'Asha Rao');
    const byCust = flatten(envelope(wa.get_whatsapp_sends_by_customer(db, ['c1'])));
    assert.equal(byCust.length, 1);
  } finally { cleanup(db); }
});

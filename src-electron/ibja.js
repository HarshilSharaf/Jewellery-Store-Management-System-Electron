/**
 * IBJA rate scraper. Fetches https://ibjarates.com/, extracts the current
 * AM/PM per-purity gold + silver rates, and returns a normalised payload
 * the caller can pass to `save_metal_rates` + `save_ibja_snapshot`.
 *
 * ibjarates.com is a small server-rendered HTML page. We regex 2-3
 * candidate shapes: their markup is not stable enough to warrant an HTML
 * parser dependency. On parse failure we return the raw HTML slice so a
 * human can diagnose without leaving the app.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Jewellery-POS/1.0 Safari/537.36';

const IBJA_URL = 'https://ibjarates.com/';

const PURITY_KEYS = ['999', '995', '916', '750', '585', 'silver_999'];

function currentIstSession(now = new Date()) {
  // IST = UTC+5:30. AM session before 14:00 IST, PM after.
  const utcHours = now.getUTCHours();
  const utcMins  = now.getUTCMinutes();
  const istTotalMins = utcHours * 60 + utcMins + 330;
  const istHour = Math.floor((istTotalMins % (24 * 60)) / 60);
  return istHour < 14 ? 'AM' : 'PM';
}

function parseNumber(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[,\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Best-effort HTML parser. Tries three progressively looser regex shapes.
 *  1. "fineness label + adjacent numeric cell" pairs
 *  2. Bare "999 ... 78425.00" style tables (per-10g)
 *  3. Fallback: labelled JSON blob if the page ships one
 */
function extractRates(html) {
  const purities = {};

  const tdPairRe = /<td[^>]*>\s*(?:Gold\s*)?(999|995|916|750|585)(?:\s*\([^)]*\))?\s*<\/td>[\s\S]{0,400}?<td[^>]*>\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)\s*<\/td>/gi;
  let m;
  while ((m = tdPairRe.exec(html)) !== null) {
    const key = m[1];
    const val = parseNumber(m[2]);
    if (val && !purities[key]) purities[key] = val;
  }

  const silverRe = /<td[^>]*>\s*Silver(?:\s*999)?\s*<\/td>[\s\S]{0,400}?<td[^>]*>\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)\s*<\/td>/i;
  const sm = silverRe.exec(html);
  if (sm) {
    const sv = parseNumber(sm[1]);
    if (sv) purities['silver_999'] = sv;
  }

  if (Object.keys(purities).length < 3) {
    const looseRe = /"(999|995|916|750|585|silver[_-]?999)"\s*:\s*"?([\d,.]+)"?/gi;
    let lm;
    while ((lm = looseRe.exec(html)) !== null) {
      const rawKey = lm[1].toLowerCase().replace(/[^a-z0-9_]/g, '');
      const key = rawKey.startsWith('silver') ? 'silver_999' : rawKey;
      const val = parseNumber(lm[2]);
      if (val && !purities[key]) purities[key] = val;
    }
  }

  return purities;
}

async function fetchIbjaRates(now = new Date()) {
  let html = '';
  try {
    const response = await fetch(IBJA_URL, {
      method:  'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' },
    });
    if (!response.ok) {
      return { ok: false, reason: 'network_error',
               error: `HTTP ${response.status}`, fetchedAt: now.toISOString(),
               rawResponse: '' };
    }
    html = await response.text();
  } catch (err) {
    return { ok: false, reason: 'network_error',
             error: err && err.message ? err.message : String(err),
             fetchedAt: now.toISOString(), rawResponse: '' };
  }

  const rawSlice = html.slice(0, 5000);
  const purities = extractRates(html);

  const missingCritical = !purities['999'] || !purities['916'];
  if (missingCritical) {
    return { ok: false, reason: 'parse_failure',
             fetchedAt: now.toISOString(), rawResponse: rawSlice, purities };
  }

  const normalised = {};
  for (const k of PURITY_KEYS) {
    if (purities[k] != null) normalised[k] = purities[k];
  }

  return {
    ok:          true,
    session:     currentIstSession(now),
    purities:    normalised,
    fetchedAt:   now.toISOString(),
    rawResponse: rawSlice,
  };
}

module.exports = { fetchIbjaRates, currentIstSession, extractRates };

/**
 * WhatsApp Cloud API (Meta Graph) template message sender.
 * Runs in the Electron main process; renderer talks to it via the
 * `whatsapp:*` IPC channels registered in main.js.
 *
 * NOTE: This module only handles the HTTP POST. Persistence lives in the
 * `whatsappsendlog` table via the queue_whatsapp_send + update_whatsapp_status
 * SPs — main.js orchestrates the two calls around this fetch.
 */

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE    = 'https://graph.facebook.com';

async function sendTemplateMessage({ phoneNumberId, apiToken, to, templateName, language, components }) {
  if (!phoneNumberId || !apiToken) {
    return { ok: false, error: 'not_configured' };
  }
  if (!to || !templateName) {
    return { ok: false, error: 'missing_recipient_or_template' };
  }

  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language || 'en' },
      ...(components ? { components } : {}),
    },
  };

  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }

    if (!response.ok) {
      const errMsg = payload && payload.error
        ? (payload.error.message || JSON.stringify(payload.error))
        : `HTTP ${response.status}`;
      return { ok: false, error: errMsg, status: response.status, body: payload };
    }

    const messageId = payload && Array.isArray(payload.messages) && payload.messages[0]
      ? payload.messages[0].id
      : null;
    return { ok: true, messageId, body: payload };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { sendTemplateMessage };

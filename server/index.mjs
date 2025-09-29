// server/index.mjs
import express from 'express';
import crypto from 'node:crypto';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// --- Load ../.env explicitly (project root) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const VERIFY     = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const WABA_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID   = process.env.WHATSAPP_PHONE_NUMBER_ID;

console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Service key present?', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- Supabase (Service Role) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Express app ---
const app = express();
// raw body for this route (signature verification needs raw bytes)
app.use('/api/whatsapp', express.raw({ type: 'application/json' }));

// --- Signature helper ---
function verifyMetaSignature(req, rawBuffer) {
  try {
    const sigHeader = req.headers['x-hub-signature-256'] || '';
    const sig = String(sigHeader).replace('sha256=', '');
    const expected = crypto.createHmac('sha256', APP_SECRET).update(rawBuffer).digest('hex');
    return sig && sig === expected;
  } catch (e) {
    console.error('Signature verify error:', e);
    return false;
  }
}

// --- GET: webhook verification ---
app.get('/api/whatsapp', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

// --- POST: messages / statuses ---
app.post('/api/whatsapp', async (req, res) => {
  console.log('>>> Webhook hit! Got a POST to /api/whatsapp');
  console.log('>>> Headers:', req.headers);
  console.log('>>> Raw body length:', req.body?.length);

  const raw = req.body; // Buffer

  const okSig = verifyMetaSignature(req, raw);
  console.log('>>> Signature OK?', okSig);
  if (!okSig) return res.sendStatus(401);

  // ACK fast
  res.sendStatus(200);

  // Parse JSON
  let payload = {};
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch (e) { console.error('JSON parse error:', e); return; }

  const value    = payload?.entry?.[0]?.changes?.[0]?.value;
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

  // Status-only updates
  if (!messages.length) {
    if (statuses.length) console.log('>>> Status update(s):', statuses);
    else console.log('>>> Non-message change:', JSON.stringify(value));
    return;
  }

  // Message handling
  const msg      = messages[0];
  const from     = msg?.from;                // digits like '9743...'
  const kind     = msg?.type;                // 'text', 'audio', ...
  const bodyText = msg?.text?.body?.trim();
  const msgId    = msg?.id;

  console.log('>>> Message summary:', { from, kind, bodyText });
  if (!from) return;

  // Admin lookup by phone (digits only, no '+')
  const msisdn = from.replace(/[^\d]/g, '');
  const { data: adminRows, error: adminErr } = await supabase
    .from('admins')
    .select('id')
    .contains('whatsapp_numbers', [msisdn])
    .limit(1);

  if (adminErr) console.error('admin lookup error:', adminErr);
  const adminId = adminRows?.[0]?.id || null;

  if (!adminId) {
    await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: { body: 'عذرًا، هذا الرقم غير مخوّل.' }
      })
    });
    console.warn('No adminId for phone', msisdn);
    return;
  }

  // Smoke audit insert (prove DB writes)
  try {
    const { error: auditErr } = await supabase.from('whatsapp_audit').insert({
      admin_id: adminId,
      phone: from,
      message_id: msgId,
      input_type: kind,
      input_text: bodyText || '',
      action: 'echo.test',
      success: true,
      details: { note: 'smoke insert from webhook' },
      raw_payload: value
    });
    if (auditErr) console.error('audit insert error:', auditErr);
    else console.log('>>> audit insert ok');
  } catch (e) {
    console.error('audit insert threw:', e);
  }

  // Echo reply (replace with your real handler later)
  const reply = kind === 'text' && bodyText ? `تم — وصلني: ${bodyText}` : `Received a ${kind || 'message'} ✅`;
  const sendResp = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: from,
      type: 'text',
      text: { body: reply }
    })
  });
  console.log('>>> WA send status:', sendResp.status, sendResp.statusText, await sendResp.text());

  // // Plug your real handler here when ready:
  // // const { handleIncomingMessage } = await import('../src/lib/wa/handler.js');
  // // const botReply = await handleIncomingMessage({ supabase, adminId, from, type: kind, text: bodyText || '', msgId, raw: payload });
  // // if (botReply) await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, { ...send with botReply... });
});

// --- Listen ---
const PORT = Number(process.env.WEBHOOK_PORT || 8787);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Webhook running at http://127.0.0.1:${PORT}/api/whatsapp`);
});

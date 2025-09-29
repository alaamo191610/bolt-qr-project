import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { handleIncomingMessage } from '../../lib/wa/handler';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const WABA_TOKEN = process.env.WHATSAPP_TOKEN!;
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN!;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET!;

function verifyMetaSignature(req: NextRequest, raw: string) {
    const sig = req.headers.get('x-hub-signature-256')?.replace('sha256=', '') ?? '';
    const expected = crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
    console.log('>>> POST /api/whatsapp headers:', req.headers);
    return sig && sig === expected;
}

function normalizePhone(msisdn: string) {
    // WhatsApp gives digits; keep it as-is, but strip + and spaces if ever present
    return msisdn.replace(/[^\d]/g, '');
}

async function sendText(to: string, body: string) {
    await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
}

async function findAdminIdByPhone(db: SupabaseClient, rawPhone: string): Promise<string | null> {
    const phone = normalizePhone(rawPhone);
    // text[] contains operator for arrays
    const { data, error } = await db
        .from('admins')
        .select('id')
        .contains('whatsapp_numbers', [phone])
        .limit(1);
    if (error) {
        console.error('admin lookup failed', error);
        return null;
    }
    return data?.[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
    const sp = new URL(req.url).searchParams;
    if (sp.get('hub.mode') === 'subscribe' && sp.get('hub.verify_token') === VERIFY) {
        return new NextResponse(sp.get('hub.challenge') ?? '', { status: 200 });
    }
    return new NextResponse('forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
    const raw = await req.text();
    if (!verifyMetaSignature(req, raw)) {
        return new NextResponse('invalid signature', { status: 401 });
    }

    let body: any;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = msg?.from as string | undefined;
    const msgId = msg?.id as string | undefined;

    if (!from || !msg) return NextResponse.json({ ok: true });

    // Per-admin allow-by-number
    const adminId = await findAdminIdByPhone(supabase, from);
    if (!adminId) {
        await sendText(from, 'عذرًا، هذا الرقم غير مخوّل.');
        return NextResponse.json({ ok: true });
    }

    try {
        let reply: string | null = null;

        if (msg.type === 'text') {
            const text = (msg.text?.body ?? '').trim();
            reply = await handleIncomingMessage({
                supabase,
                adminId,               // <= pass the scoped admin
                from,
                type: 'text',
                text,
                msgId,
                raw: body,
            });
        } else if (msg.audio?.id) {
            reply = '🎙️ أرسل نصًا أو فعّل التحويل الصوتي لاحقًا.'; // plug STT later
        } else {
            reply = 'أرسل نصًا مثل: "أضف صنف اسم: برجر سعر: 25 متاح: نعم".';
        }

        if (reply) await sendText(from, reply);
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        await sendText(from, 'حدث خطأ غير متوقع. حاول لاحقًا.');
        return NextResponse.json({ ok: false, error: e?.message ?? 'error' });
    }
}
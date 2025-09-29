import type { SupabaseClient } from '@supabase/supabase-js';
import { makeWAAdapters } from './waAdapters';

type Ctx = {
  supabase: SupabaseClient;
  adminId: string;           // <= NEW
  from: string;              // phone
  type: 'text' | 'audio';
  text: string;              // body or transcript
  msgId?: string;            // WhatsApp message id
  raw?: any;                 // webhook payload (for audit)
};

const T = {
  missing: (f: string, ex?: string) => `المعلومة ناقصة: **${f}**${ex?`\nمثال: ${ex}`:''}\nأرسل ${f} الآن.`,
  invalid: (f: string, h?: string) => `القيمة غير صحيحة لحقل: **${f}**${h?`\n${h}`:''}`,
  confirm: (s: string) => `راجعت:\n${s}\n\nأرسل: **تأكيد** أو **إلغاء**.`,
  done: 'تم بنجاح ✅',
  cancelled: 'تم الإلغاء.',
};

function normalizeDigits(s: string) { return s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()); }
function parsePrice(s: string) { const v = Number(normalizeDigits(s).replace(/[^\d.]/g, '')); return Number.isFinite(v) ? v : null; }
function isYesNo(s: string) { const t = s.trim().toLowerCase(); return t === 'نعم' || t === 'لا' || t === 'yes' || t === 'no'; }

async function getSession(supabase: SupabaseClient, adminId: string, phone: string) {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('admin_id', adminId)
    .eq('phone', phone)
    .order('updated_at', { ascending: false })
    .limit(1);
  return data?.[0];
}
async function setSession(supabase: SupabaseClient, adminId: string, phone: string, state: string, form: any) {
  await supabase.from('whatsapp_sessions').insert({
    admin_id: adminId,
    phone,
    state,
    form_data: form,
    expires_at: new Date(Date.now()+20*60*1000),
  });
}

export async function handleIncomingMessage(ctx: Ctx): Promise<string> {
  const { supabase, adminId, from, text, msgId, raw } = ctx;
  const adapters = makeWAAdapters(supabase, { adminId });


  // Idempotency: if we saw this message_id for this admin, skip
  if (msgId) {
    const { data: seen } = await supabase
      .from('whatsapp_audit')
      .select('id')
      .eq('admin_id', adminId)
      .eq('message_id', msgId)
      .limit(1);
    if (seen?.length) return 'تمت معالجة هذه الرسالة مسبقًا ✅';
  }

  // Continue session?
  const session = await getSession(supabase, adminId, from);
  if (session) {
    const state: string = session.state;
    const data: any = session.form_data || {};

    if (state === 'add_item.waiting_name') {
      const v = text.trim(); if (!v) return T.invalid('الاسم');
      data.name = v; await setSession(supabase, adminId, from, 'add_item.waiting_price', data);
      return T.missing('السعر', 'مثال: 25');
    }

    if (state === 'add_item.waiting_price') {
      const p = parsePrice(text); if (p == null) return T.invalid('السعر', 'مثال: 25');
      data.price = p; await setSession(supabase, adminId, from, 'add_item.waiting_available', data);
      return T.missing('التوافر (نعم/لا)', 'مثال: نعم');
    }

    if (state === 'add_item.waiting_available') {
      if (!isYesNo(text)) return T.invalid('التوافر', 'اكتب: نعم أو لا');
      data.available = /^نعم|yes$/i.test(text);
      await setSession(supabase, adminId, from, 'add_item.confirm', data);
      const s = `الاسم: ${data.name}\nالسعر: ${data.price} QAR\nمتاح: ${data.available ? 'نعم' : 'لا'}`;
      return T.confirm(s);
    }

    if (state === 'add_item.confirm') {
      if (/^إلغاء|cancel$/i.test(text)) {
        await setSession(supabase, adminId, from, 'idle', {});
        return T.cancelled;
      }
      if (/^تأكيد|confirm$/i.test(text)) {
        try {
          const rec = await adapters.addMenuItemByNamePriceAvailable(data.name, data.price, data.available);
          await supabase.from('whatsapp_audit').insert({
            admin_id: adminId,
            phone: from,
            message_id: msgId,
            input_type: ctx.type,
            input_text: JSON.stringify(data),
            action: 'menus.insert',
            success: true,
            details: { id: rec.id },
            raw_payload: raw,
          });
          await setSession(supabase, adminId, from, 'idle', {});
          return T.done;
        } catch (error: any) {
          await supabase.from('whatsapp_audit').insert({
            admin_id: adminId,
            phone: from,
            message_id: msgId,
            input_type: ctx.type,
            input_text: JSON.stringify(data),
            action: 'menus.insert',
            success: false,
            details: { error: error?.message },
            raw_payload: raw,
          });
          await setSession(supabase, adminId, from, 'idle', {});
          return `فشل الإضافة: ${error?.message ?? 'خطأ'}`;
        }
      }
      return 'أرسل **تأكيد** أو **إلغاء**.';
    }
  }

  // --- New commands (regex) ---
  const mAdd = text.match(/أضف\s+صنف(?:\s+اسم\s*[:：]\s*(.+?))?(?:\s+سعر\s*[:：]\s*([^\s]+))?(?:\s+متاح\s*[:：]\s*(نعم|لا))?/i);
  if (mAdd) {
    const [, name, priceRaw, avRaw] = mAdd;
    const data: any = {};
    if (name) data.name = name.trim();
    if (priceRaw) data.price = parsePrice(priceRaw);
    if (avRaw) data.available = avRaw === 'نعم';

    if (!data.name)        { await setSession(supabase, adminId, from, 'add_item.waiting_name', data);        return T.missing('الاسم','مثال: برجر كلاسيك'); }
    if (data.price == null){ await setSession(supabase, adminId, from, 'add_item.waiting_price', data);       return T.missing('السعر','مثال: 25'); }
    if (typeof data.available !== 'boolean') {
      await setSession(supabase, adminId, from, 'add_item.waiting_available', data); return T.missing('التوافر (نعم/لا)','مثال: نعم');
    }

    await setSession(supabase, adminId, from, 'add_item.confirm', data);
    const s = `الاسم: ${data.name}\nالسعر: ${data.price} QAR\nمتاح: ${data.available ? 'نعم' : 'لا'}`;
    return T.confirm(s);
  }

  // Edit price
  const mPrice = text.match(/عدّل\s+سعر\s+(.+?)\s+إلى\s+(\d+(?:\.\d+)?)/i);
  if (mPrice) {
    const [, nameLike, p] = mPrice; const price = parseFloat(p);
    try {
      const rows = await adapters.updateMenuPriceByNameILike(nameLike, price);
      await supabase.from('whatsapp_audit').insert({
        admin_id: adminId, phone: from, message_id: msgId, input_type: ctx.type, input_text: text,
        action: 'menus.update.price', success: true, details: { affected: rows?.length, rows }, raw_payload: raw
      });
      return rows?.length ? 'تم تعديل السعر ✅' : 'لم يتم العثور على أصناف مطابقة.';
    } catch (e: any) {
      await supabase.from('whatsapp_audit').insert({
        admin_id: adminId, phone: from, message_id: msgId, input_type: ctx.type, input_text: text,
        action: 'menus.update.price', success: false, details: { error: e?.message }, raw_payload: raw
      });
      return `فشل التعديل: ${e?.message}`;
    }
  }

  // Toggle availability
  const mToggle = text.match(/(أوقف|فعّل)\s+صنف\s+(.+)/i);
  if (mToggle) {
    const isEnable = mToggle[1] === 'فعّل'; const nameLike = mToggle[2].trim();
    try {
      const rows = await adapters.setMenuAvailabilityByNameILike(nameLike, isEnable);
      await supabase.from('whatsapp_audit').insert({
        admin_id: adminId, phone: from, message_id: msgId, input_type: ctx.type, input_text: text,
        action: 'menus.update.available', success: true, details: { affected: rows?.length, rows }, raw_payload: raw
      });
      return rows?.length ? `تم ${isEnable ? 'تفعيل' : 'إيقاف'} الصنف ✅` : 'لم يتم العثور على أصناف مطابقة.';
    } catch (e: any) {
      await supabase.from('whatsapp_audit').insert({
        admin_id: adminId, phone: from, message_id: msgId, input_type: ctx.type, input_text: text,
        action: 'menus.update.available', success: false, details: { error: e?.message }, raw_payload: raw
      });
      return `فشل التحديث: ${e?.message}`;
    }
  }

  // Search
  const mSearch = text.match(/ابحث\s+عن\s+(.+)/i);
  if (mSearch) {
    const q = mSearch[1].trim();
    const rows = await adapters.searchMenuILike(q);
    if (!rows.length) return 'لا يوجد نتائج.';
    return rows.map(d => `• ${d.name_ar} — ${d.price} QAR — ${d.available ? 'متاح' : 'غير متاح'}`).join('\n');
  }

  return `لم أفهم الأمر.\nأمثلة:\n- "PIN ${process.env.WHATSAPP_PIN ?? '4321'} أضف صنف اسم: برجر سعر: 25 متاح: نعم"\n- "عدّل سعر برجر كلاسيك إلى 27"\n- "أوقف صنف برجر"`;
}

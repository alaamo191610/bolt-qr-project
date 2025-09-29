import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ShoppingCart, Clock, X, Info } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAdminMonetary } from '../../hooks/useAdminMonetary';
import { computeTotals } from '../../pricing/totals';
import { formatPrice } from '../../pricing/usePrice';
import type { MenuItem } from './MenuItemCard';
import type { Promotion } from '../../pricing/types';
import { HiXMark } from "react-icons/hi2";

interface CartItem extends MenuItem { quantity: number; }

interface Props {
  cart: CartItem[];
  tableNumber: string;
  isRTL: boolean;
  isOrdering: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
  onPlaceOrder: () => void;

  /** NEW: High-impact UX hooks */
  onEditItem?: (item: CartItem) => void;                 // open modifiers editor for this line
  onClearCart?: () => void;                              // clear all items
  validatePromo?: (code: string) => Promise<Promotion | null>; // optional async promo validator
}

// helpers aware of extras (price_delta)
const unitTotal = (item: CartItem) => (item.price || 0) + ((item as any).price_delta || 0);
const lineTotal = (item: CartItem) => unitTotal(item) * (item.quantity || 0);

const CartDrawer: React.FC<Props> = ({
  cart,
  tableNumber,
  isRTL,
  isOrdering,
  onClose,
  onAdd,
  onRemove,
  onPlaceOrder,
  onEditItem,
  onClearCart,
  validatePromo,
}) => {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const dragged = useRef(false);

  // ---- Pricing/Billing prefs (admin) ----
  const { prefs, billing, loading: moneyLoading } = useAdminMonetary();
  const fmt = (v: number) => formatPrice(v, prefs);

  /** NEW: promo (can be applied via validatePromo) */
  const [appliedPromo, setAppliedPromo] = useState<Promotion | null>(null);

  /** NEW: tip UI */
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>('');

  /** NEW: promo UI state */
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  /** NEW: live feedback toast text */
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!flashMsg) return;
    const id = setTimeout(() => setFlashMsg(null), 900);
    return () => clearTimeout(id);
  }, [flashMsg]);

  const subtotal = useMemo(
    () => cart.reduce((total, item) => total + lineTotal(item), 0),
    [cart]
  );

  const extras = useMemo(
    () => cart.reduce((s, it) => s + (((it as any).price_delta || 0) * (it.quantity || 0)), 0),
    [cart]
  );

  const itemsCount = useMemo(
    () => cart.reduce((n, it) => n + (it.quantity || 0), 0),
    [cart]
  );

  const breakdown = useMemo(() => {
    // subtotal already includes extras; extras line is informational
    if (moneyLoading || !billing) {
      const delivery = billing?.deliveryFee ?? 0;
      return { discount: 0, vat: 0, service: 0, delivery, total: subtotal + delivery };
    }
    const { discount, vat, service, total } = computeTotals(subtotal, billing, appliedPromo);
    return { discount, vat, service, delivery: billing.deliveryFee, total };
  }, [subtotal, billing, appliedPromo, moneyLoading]);

  /** NEW: tip value (visual add-on; not part of computeTotals unless you decide so) */
  const tipValue = useMemo(() => {
    const pct = Number.isFinite(tipPercent) ? tipPercent : 0;
    return Math.max(0, Math.round((breakdown.total * pct) / 100));
  }, [breakdown.total, tipPercent]);

  // Disable background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* ---------- Mobile swipe-to-close (full-screen) ---------- */
  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (window.innerWidth >= 640) return; // mobile only
    startY.current = e.touches[0].clientY;
    dragged.current = true;
  };
  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (!dragged.current || startY.current == null) return;
    const y = e.touches[0].clientY - startY.current;
    if (y < 0) return; // only downward drag
    if (panelRef.current) {
      panelRef.current.style.transform = `translateY(${Math.min(y, 160)}px)`;
    }
  };
  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (!dragged.current) return;
    dragged.current = false;
    const node = panelRef.current;
    if (!node) return;
    const matrix = new WebKitCSSMatrix(getComputedStyle(node).transform);
    const y = matrix.m42 || 0;
    if (y > 90) {
      node.style.transition = 'transform .22s ease-out';
      node.style.transform = 'translateY(100%)';
      setTimeout(onClose, 200);
    } else {
      node.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)';
      node.style.transform = 'translateY(0)';
      setTimeout(() => (node.style.transition = ''), 280);
    }
  };

  const nameForIng = (item: CartItem, id: string) => {
    const list = (item.ingredients_details || [])
      .map((d: any) => d.ingredient)
      .filter(Boolean);
    const found = list.find((x: any) => x.id === id);
    return found ? (isRTL ? found.name_ar : found.name_en) : undefined;
  };

  /** NEW: local helper component for long notes */
  const ExpandableText: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    return (
      <div className={`text-[12px] text-slate-600 dark:text-slate-300 ${open ? '' : 'line-clamp-2'}`}>
        {children}
        <button
          onClick={() => setOpen(v => !v)}
          className="ml-1 text-[11px] text-emerald-700 dark:text-emerald-300 underline"
        >
          {open ? (isRTL ? 'إخفاء' : 'Less') : (isRTL ? 'المزيد' : 'More')}
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] opacity-0 animate-fade-in" />

      {/* Full-screen Panel */}
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className="absolute inset-0 bg-white dark:bg-slate-900 sm:rounded-none shadow-2xl overflow-hidden animate-page-in"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden h-4 flex items-center justify-center">
          <span className="w-12 h-1.5 rounded-full bg-slate-300/80 dark:bg-slate-600 mt-2" />
        </div>

        {/* App Bar */}
        <header className="sticky top-0 z-20 bg-white/85 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label={t('common.close') || 'Close'}
            >
              <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white grid place-items-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {t('menu.yourOrder')}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('orders.table')} {tableNumber}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
              {t('cart.keepBrowsing')}
            </button>
            {/* <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4" />
              <span>{t('menu.estimated') || 'Estimated'} 15–25 {t('menu.min') || 'min'}</span>
            </div> */}
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-5xl h-[calc(100vh-160px)] sm:h-[calc(100vh-156px)] overflow-y-auto px-4 pb-24 pt-4">
          {cart.length === 0 ? (
            <div className="h-full grid place-items-center text-center">
              <div>
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5">
                  <ShoppingCart className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  {t('menu.cartEmpty')}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isRTL ? 'أضف أطباقك المفضلة للمتابعة' : 'Add some dishes to continue'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Section: Items */}
              <section className="space-y-3">
                {cart.map((item) => {
                  const choices = ((item as any).custom_ingredients || []) as Array<{ id: string; action: 'no' | 'normal' | 'extra' }>;
                  const delta = ((item as any).price_delta || 0) as number;

                  return (
                    <div
                      key={item.id + JSON.stringify(choices)}
                      className="p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/60"
                    >
                      <div className="flex gap-3">
                        {/* Thumb */}
                        <img
                          loading="lazy"
                          src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'}
                          alt={isRTL ? (item.name_ar || item.name_en) : item.name_en}
                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/placeholder.png'; }}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                                {isRTL ? (item.name_ar || item.name_en) : item.name_en}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {fmt(item.price)} {t('menu.each')}
                              </p>
                            </div>

                            {/* Qty stepper + NEW: Edit button + trash at qty=1 */}
                            <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-2`}>
                              {/* Edit modifiers */}
                              {onEditItem && (
                                <button
                                  onClick={() => onEditItem(item)}
                                  className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg text-xs border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                                  aria-label={isRTL ? 'تعديل الإضافات' : 'Edit options'}
                                >
                                  {isRTL ? 'تعديل' : 'Edit'}
                                </button>
                              )}

                              {/* − or trash */}
                              {item.quantity > 1 ? (
                                <button
                                  onClick={() => { onRemove(item.id); setFlashMsg(`-1 ${isRTL ? (item.name_ar || item.name_en) : item.name_en}`); }}
                                  className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white grid place-items-center transition active:scale-95"
                                  aria-label={t('common.decrease') || 'Decrease'}
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => { onRemove(item.id); setFlashMsg(`-1 ${isRTL ? (item.name_ar || item.name_en) : item.name_en}`); }}
                                  className="w-9 h-9 rounded-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-300 grid place-items-center transition active:scale-95"
                                  aria-label={isRTL ? 'إزالة العنصر' : 'Remove item'}
                                  title={isRTL ? 'إزالة العنصر' : 'Remove item'}
                                >
                                  <HiXMark className="w-4 h-4" />
                                </button>
                              )}

                              <span
                                key={item.quantity}
                                className="min-w-[2ch] text-center font-semibold text-slate-900 dark:text-white animate-bump"
                                aria-live="polite"
                              >
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => { onAdd(item); setFlashMsg(`+1 ${isRTL ? (item.name_ar || item.name_en) : item.name_en}`); }}
                                className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white grid place-items-center transition active:scale-95 shadow"
                                aria-label={t('common.increase') || 'Increase'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Notes (expandable) */}
                          {!!(item as any).notes && (
                            <div className="mt-1.5">
                              <ExpandableText>{(item as any).notes}</ExpandableText>
                            </div>
                          )}

                          {/* Ingredient chips with overflow +N & Edit link */}
                          {!!choices.length && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {choices.slice(0, 6).map((x) => (
                                <span
                                  key={x.id + x.action}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border ${x.action === 'no'
                                      ? 'border-red-300 text-red-700 bg-red-50 dark:bg-red-900/20 dark:border-red-700/40 dark:text-red-200'
                                      : x.action === 'extra'
                                        ? 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-200'
                                        : 'border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-200'
                                    }`}
                                >
                                  {nameForIng(item, x.id) ? `${nameForIng(item, x.id)} — ` : ''}
                                  {x.action === 'no' ? (isRTL ? 'بدون' : 'No')
                                    : x.action === 'extra' ? (isRTL ? 'إضافي' : 'Extra')
                                      : (isRTL ? 'عادي' : 'Normal')}
                                </span>
                              ))}

                              {choices.length > 6 && (
                                <button
                                  onClick={() => onEditItem?.(item)}
                                  className="text-[11px] px-2 py-0.5 rounded-full border border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-200"
                                >
                                  +{choices.length - 6} {isRTL ? 'أخرى' : 'more'}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Price row */}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5" />
                              <span>
                                {fmt(item.price)} {isRTL ? '+ إضافات ' : '+ extras '} {fmt(delta)} × {item.quantity}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                              {fmt(lineTotal(item))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* NEW: Tip & Promo */}
              <section className="mt-6 grid gap-3 sm:grid-cols-2">
                {/* Tip */}
                <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/50 p-3 bg-white/70 dark:bg-slate-800/60">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">
                    {isRTL ? 'إكرامية (اختياري)' : 'Tip (optional)'}
                  </div>
                  <div className="flex items-center gap-2">
                    {[0, 5, 10, 15].map(p => (
                      <button
                        key={p}
                        onClick={() => { setTipPercent(p); setCustomTip(String(p || '')); }}
                        className={`px-3 py-1.5 rounded-lg border text-sm ${tipPercent === p
                          ? 'border-emerald-600 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                      >
                        {p}%
                      </button>
                    ))}
                    <div className="relative">
                      <input
                        inputMode="numeric"
                        value={customTip}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, '');
                          setCustomTip(v);
                          setTipPercent(v ? Number(v) : 0);
                        }}
                        placeholder={isRTL ? 'مخصص %' : 'Custom %'}
                        className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/40 px-3 py-1.5 text-sm"
                        aria-label={isRTL ? 'إكرامية مخصصة' : 'Custom tip percentage'}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                  </div>
                  {tipPercent > 0 && (
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {isRTL ? 'قيمة الإكرامية' : 'Tip amount'}: <strong className="text-slate-700 dark:text-slate-200">{fmt(tipValue)}</strong>
                    </div>
                  )}
                </div>

                {/* Promo */}
                <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/50 p-3 bg-white/70 dark:bg-slate-800/60">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">
                    {isRTL ? 'رمز الخصم' : 'Promo code'}
                  </div>
                  <div className={`flex ${isRTL ? 'flex-row-reverse' : ''} items-center gap-2`}>
                    <input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.trim())}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/40 px-3 py-2 text-sm"
                      placeholder={isRTL ? 'ادخل الرمز' : 'Enter code'}
                    />
                    <button
                      onClick={async () => {
                        if (!promoCode) return;
                        setPromoLoading(true); setPromoError(null);
                        try {
                          const promo = await (validatePromo?.(promoCode) ?? Promise.resolve(null));
                          if (promo) setAppliedPromo(promo);
                          else setPromoError(isRTL ? 'رمز غير صالح' : 'Invalid code');
                        } catch {
                          setPromoError(isRTL ? 'تعذر التحقق' : 'Could not validate');
                        } finally { setPromoLoading(false); }
                      }}
                      disabled={promoLoading}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {promoLoading ? (isRTL ? 'جاري التحقق…' : 'Checking…') : (isRTL ? 'تطبيق' : 'Apply')}
                    </button>
                  </div>
                  {appliedPromo && (
                    <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                      {isRTL ? 'تم تطبيق الخصم' : 'Discount applied'}: <strong>{appliedPromo.code}</strong>
                    </div>
                  )}
                  {promoError && <div className="mt-2 text-xs text-red-600 dark:text-red-300">{promoError}</div>}
                </div>
              </section>

              {/* Section: Totals */}
              <section className="mt-6 rounded-2xl border border-slate-200/70 dark:border-slate-700/50 p-3 bg-white/70 dark:bg-slate-800/60">
                {/* Extras (informational; already included in subtotal) */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t('cart.extras') || (isRTL ? 'الإضافات' : 'Extras')}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {fmt(extras)}
                  </span>
                </div>

                {/* Subtotal */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t('cart.subtotal') || (isRTL ? 'المجموع' : 'Subtotal')}
                  </span>
                  <span className="text-base font-semibold text-slate-900 dark:text-white">
                    {fmt(subtotal)}
                  </span>
                </div>

                {/* Discount (if any) */}
                {breakdown.discount > 0 && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {t('billing.discount') || (isRTL ? 'خصم' : 'Discount')}
                    </span>
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      -{fmt(breakdown.discount)}
                    </span>
                  </div>
                )}

                {/* VAT / Service with tooltip explanations */}
                {billing?.showVatLine && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {t('fees.vat') || 'VAT'}
                      <span
                        className="ml-1 inline-block w-4 h-4 rounded-full border border-slate-300 text-[10px] grid place-items-center"
                        title={isRTL ? 'تُحتسب الضريبة بعد الخصم وقبل الإكرامية (حسب الإعدادات)' : 'VAT is calculated after discount and before tip (per settings)'}
                      >i</span>
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {fmt(breakdown.vat)}
                    </span>
                  </div>
                )}

                {billing?.showServiceChargeLine && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {t('fees.serviceCharge') || (isRTL ? 'رسوم الخدمة' : 'Service')}
                      <span
                        className="ml-1 inline-block w-4 h-4 rounded-full border border-slate-300 text-[10px] grid place-items-center"
                        title={isRTL ? 'رسوم الخدمة تُضاف على المجموع قبل الضريبة' : 'Service charge is applied to the subtotal before VAT'}
                      >i</span>
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {fmt(breakdown.service)}
                    </span>
                  </div>
                )}

                {/* Total (original) */}
                <div className="flex items-center justify-between py-2 border-t mt-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t('common.total') || (isRTL ? 'الإجمالي' : 'Total')}
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {fmt(breakdown.total)}
                  </span>
                </div>

                {/* NEW: Tip (if any) */}
                {tipPercent > 0 && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {isRTL ? 'إكرامية' : 'Tip'} ({tipPercent}%)
                    </span>
                    <span className="text-base font-semibold text-slate-900 dark:text-white">
                      {fmt(tipValue)}
                    </span>
                  </div>
                )}

                {/* NEW: Total to pay (incl. tip) */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {isRTL ? 'الإجمالي للدفع' : 'Total to pay'}
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {fmt(breakdown.total + tipValue)}
                  </span>
                </div>
              </section>
            </>
          )}
        </main>

        {/* Sticky bottom action bar */}
        <div className="fixed inset-x-0 bottom-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-4 py-3">
            {cart.length > 0 ? (
              <div className={`flex ${isRTL ? 'flex-row-reverse' : ''} items-center justify-between gap-3`}>
                <div className={`flex ${isRTL ? 'flex-row-reverse' : ''} items-center gap-2`}>
                  {/* Clear cart */}
                  {cart.length > 0 && onClearCart && (
                    <button
                      onClick={onClearCart}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs"
                    >
                      {isRTL ? 'تفريغ السلة' : 'Clear cart'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {itemsCount} {isRTL ? 'عنصر' : 'items'}
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {fmt(breakdown.total + tipValue)}
                    </div>
                  </div>

                  <button
                    onClick={onPlaceOrder}
                    disabled={isOrdering || cart.length === 0 || moneyLoading}
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-6 font-semibold shadow-lg hover:from-emerald-700 hover:to-emerald-800 active:scale-[.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('menu.placeOrder')}
                  >
                    {isOrdering ? (t('status.placingOrder') || 'Placing…') : `🍽️ ${t('menu.placeOrder')}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {isRTL ? 'سلة التسوق فارغة' : 'Your cart is empty'}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-xl bg-emerald-600 text-white py-3 px-6 font-semibold shadow hover:bg-emerald-700 active:scale-[.99] transition"
                >
                  {isRTL ? 'تصفح القائمة' : 'Browse the menu'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        .animate-fade-in { animation: fadeIn .18s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

        .animate-page-in { animation: pageIn .28s cubic-bezier(.22,1,.36,1) both; }
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(12px) }
          to   { opacity: 1; transform: translateY(0) }
        }

        .animate-bump { animation: bump .22s cubic-bezier(.34,1.56,.64,1); display:inline-block; }
        @keyframes bump { 0%{ transform: scale(1) } 50%{ transform: scale(1.15) } 100%{ transform: scale(1) } }
      `}</style>
    </div>
  );
};

export default CartDrawer;
import React, { useEffect, useMemo, useRef } from 'react';
import { Minus, Plus, ShoppingCart, Clock, X, Trash2, Info } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { MenuItem } from './MenuItemCard';

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
}

const money = (v: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'QAR',
    maximumFractionDigits: 2,
  }).format(v || 0);

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
}) => {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const dragged = useRef(false);

  const subtotal = useMemo(
    () => cart.reduce((total, item) => total + lineTotal(item), 0),
    [cart]
  );
  const extras = useMemo(
    () =>
      cart.reduce(
        (s, it) => s + (((it as any).price_delta || 0) * (it.quantity || 0)),
        0
      ),
    [cart]
  );
  const itemsCount = useMemo(
    () => cart.reduce((n, it) => n + (it.quantity || 0), 0),
    [cart]
  );

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
                  {t('orders.table')} {tableNumber} • {itemsCount} {isRTL ? 'عنصر' : 'items'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4" />
              <span>{t('menu.estimated') || 'Estimated'} 15–25 {t('menu.min') || 'min'}</span>
            </div>
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
                  const choices = ((item as any).custom_ingredients || []) as Array<{
                    id: string; action: 'no' | 'normal' | 'extra'
                  }>;
                const delta = ((item as any).price_delta || 0) as number;

                return (
                  <div
                    key={item.id + JSON.stringify(choices)}
                    className="p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/60"
                  >
                    <div className="flex gap-3">
                      {/* Thumb */}
                      <img
                        src={
                          item.image_url ||
                          'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'
                        }
                        alt={item.name_en}
                        className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl"
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                              {isRTL ? (item.name_ar || item.name_en) : item.name_en}
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {money(item.price)} {t('menu.each')}
                            </p>
                          </div>

                          {/* Qty stepper */}
                          <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-2`}>
                            <button
                              onClick={() => onRemove(item.id)}
                              className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white grid place-items-center transition active:scale-95"
                              aria-label="Decrease"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span
                              key={item.quantity}
                              className="min-w-[2ch] text-center font-semibold text-slate-900 dark:text-white animate-bump"
                            >
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => onAdd(item)}
                              className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white grid place-items-center transition active:scale-95 shadow"
                              aria-label="Increase"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Notes */}
                        {!!(item as any).notes && (
                          <div className="mt-1.5 text-[12px] text-slate-600 dark:text-slate-300 line-clamp-2">
                            {(item as any).notes}
                          </div>
                        )}

                        {/* Ingredient chips */}
                        {!!choices.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {choices.map((x) => (
                              <span
                                key={x.id + x.action}
                                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                  x.action === 'no'
                                    ? 'border-red-300 text-red-700 bg-red-50 dark:bg-red-900/20 dark:border-red-700/40 dark:text-red-200'
                                    : x.action === 'extra'
                                    ? 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-200'
                                    : 'border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-200'
                                }`}
                              >
                                {nameForIng(item, x.id) ? `${nameForIng(item, x.id)} — ` : ''}
                                {x.action === 'no'
                                  ? (isRTL ? 'بدون' : 'No')
                                  : x.action === 'extra'
                                  ? (isRTL ? 'إضافي' : 'Extra')
                                  : (isRTL ? 'عادي' : 'Normal')}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Price row */}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5" />
                            <span>
                              {money(item.price)} {isRTL ? '+ إضافات ' : '+ extras '} {money(delta)} × {item.quantity}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {money(lineTotal(item))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </section>

              {/* Section: Order note / tips (optional UI only) */}
              <section className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/50 p-3 bg-white/70 dark:bg-slate-800/60">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">
                    {isRTL ? 'ملاحظة للطلب (اختياري)' : 'Order note (optional)'}
                  </div>
                  <textarea
                    className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/40 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    rows={3}
                    placeholder={isRTL ? 'مثال: بدون بصل' : 'e.g., no onions'}
                    // NOTE: connect to your order note state if you want to save it
                    onChange={() => {}}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/50 p-3 bg-white/70 dark:bg-slate-800/60">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">
                    {isRTL ? 'وقت التقديم المتوقع' : 'Estimated serving time'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Clock className="w-4 h-4" />
                    <span>15–25 {t('menu.min') || 'min'}</span>
                  </div>
                </div>
              </section>

              {/* Section: Totals */}
              <section className="mt-6 rounded-2xl border border-slate-200/70 dark:border-slate-700/50 p-3 bg-white/70 dark:bg-slate-800/60">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {isRTL ? 'الإضافات' : 'Extras'}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {money(extras)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {isRTL ? 'المجموع' : 'Subtotal'}
                  </span>
                  <span className="text-base font-semibold text-slate-900 dark:text-white">
                    {money(subtotal)}
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
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  {isRTL ? 'متابعة التسوق' : 'Keep browsing'}
                </button>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {itemsCount} {isRTL ? 'عنصر' : 'items'}
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {money(subtotal)}
                    </div>
                  </div>

                  <button
                    onClick={onPlaceOrder}
                    disabled={isOrdering || cart.length === 0}
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
                  {isRTL ? 'ابدأ الطلب' : 'Start ordering'}
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

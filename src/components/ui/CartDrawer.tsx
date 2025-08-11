import React, { useEffect, useMemo, useRef } from 'react';
import { Minus, Plus, ShoppingCart, Clock } from 'lucide-react';
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

const money = (v: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 }).format(v || 0);

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

  const subtotal = useMemo(() => cart.reduce((total, item) => total + lineTotal(item), 0), [cart]);
  const extras = useMemo(() => cart.reduce((s, it) => s + (((it as any).price_delta || 0) * (it.quantity || 0)), 0), [cart]);

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

  /* ---------- Mobile swipe-to-close (simple, no deps) ---------- */
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
      node.style.transition = 'transform .2s ease-out';
      node.style.transform = 'translateY(100%)';
      setTimeout(onClose, 180);
    } else {
      node.style.transition = 'transform .25s cubic-bezier(.22,1,.36,1)';
      node.style.transform = 'translateY(0)';
      setTimeout(() => (node.style.transition = ''), 260);
    }
  };

  const nameForIng = (item: CartItem, id: string) => {
    const list = (item.ingredients_details || []).map((d: any) => d.ingredient).filter(Boolean);
    const found = list.find((x: any) => x.id === id);
    return found ? (isRTL ? found.name_ar : found.name_en) : undefined;
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] opacity-0 animate-fade-in" />

      {/* Panel */}
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className="absolute bottom-0 left-0 right-0 sm:top-0 sm:bottom-0 sm:right-0 sm:left-auto sm:w-[440px] w-full bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-l-2xl sm:rounded-tr-none shadow-2xl overflow-hidden animate-sheet-in sm:animate-panel-in"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* drag handle */}
        <div className="sm:hidden h-4 flex items-center justify-center">
          <span className="w-10 h-1.5 rounded-full bg-slate-300/80 dark:bg-slate-600 mt-2" />
        </div>

        {/* Header */}
        <div className="sticky top-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-5 py-4 z-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧾</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('menu.yourOrder')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('orders.table')} {tableNumber}</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition" aria-label={t('common.close') || 'Close'}>
              <svg className="w-5 h-5 text-slate-500 dark:text-slate-300" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="overflow-y-auto px-5 py-4 max-h-[calc(100vh-220px)] sm:max-h-[calc(100vh-200px)] space-y-3">
          {cart.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4"><ShoppingCart className="w-8 h-8 text-slate-400 dark:text-slate-500" /></div>
              <p className="text-slate-600 dark:text-slate-400">{t('menu.cartEmpty')}</p>
            </div>
          ) : (
            cart.map((item) => {
              const choices = ((item as any).custom_ingredients || []) as Array<{ id: string; action: 'no'|'normal'|'extra' }>;
              const delta = ((item as any).price_delta || 0) as number;
              return (
                <div key={item.id + JSON.stringify(choices)} className="grid grid-cols-[56px,1fr,auto] gap-3 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-700/60 border border-slate-200/70 dark:border-slate-600/50">
                  {/* thumb */}
                  <img src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'} alt={item.name_en} className="w-14 h-14 object-cover rounded-lg" />

                  {/* info */}
                  <div className="min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate">{isRTL ? (item.name_ar || item.name_en) : item.name_en}</h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2 hidden sm:inline">{money(item.price)} {t('menu.each')}</span>
                    </div>

                    {/* chips: ingredients choices */}
                    {!!choices.length && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {choices.map((x) => (
                          <span key={x.id + x.action} className={`text-[11px] px-2 py-0.5 rounded-full border ${x.action === 'no' ? 'border-red-300 text-red-700 bg-red-50' : x.action === 'extra' ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-slate-300 text-slate-600 bg-slate-50'}`}>
                            {nameForIng(item, x.id) ? `${nameForIng(item, x.id)} — ` : ''}
                            {x.action === 'no' ? (isRTL ? 'بدون' : 'No') : x.action === 'extra' ? (isRTL ? 'إضافي' : 'Extra') : (isRTL ? 'عادي' : 'Normal')}
                          </span>
                        ))}
                      </div>
                    )}

                    {!!(item as any).notes && <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{(item as any).notes}</div>}

                    {/* price */}
                    <div className={`mt-2 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : ''} gap-2 justify-between`}>
                      <div />
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{money(lineTotal(item))}</div>
                        <div className="text-[11px] text-slate-500">{money(item.price)} {isRTL ? '+ إضافات ' : '+ extras '} {money(delta)} × {item.quantity}</div>
                      </div>
                    </div>
                  </div>

                  {/* qty controls */}
                  <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-2`}>
                    <button onClick={() => onRemove(item.id)} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-200 grid place-items-center transition active:scale-95" aria-label="Decrease"><Minus className="w-4 h-4" /></button>
                    <span key={item.quantity} className="min-w-[2ch] text-center font-semibold text-slate-900 dark:text-white animate-bump">{item.quantity}</span>
                    <button onClick={() => onAdd(item)} className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white grid place-items-center transition active:scale-95 shadow" aria-label="Increase"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="sticky bottom-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            <div className="flex items-center justify-between mb-1 text-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Clock className="w-4 h-4" /><span>{t('menu.estimated') || 'Estimated'} 15–25 {t('menu.min') || 'min'}</span></div>
              <div className="text-slate-600 dark:text-slate-400">{isRTL ? 'الإضافات' : 'Extras'}: <strong>{money(extras)}</strong></div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-lg font-extrabold text-slate-900 dark:text-white"><span className="mr-1">{t('common.total')}:</span><span className="text-emerald-600 dark:text-emerald-400 animate-total-pop">{money(subtotal)}</span></div>
              <button onClick={onPlaceOrder} disabled={isOrdering} className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-5 font-semibold shadow-lg hover:from-emerald-700 hover:to-emerald-800 active:scale-[.99] transition disabled:opacity-50 disabled:cursor-not-allowed" title={t('menu.placeOrder')}>
                {isOrdering ? <span>{t('status.placingOrder')}</span> : <span>🍽️ {t('menu.placeOrder')}</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .animate-fade-in { animation: fadeIn .18s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .animate-sheet-in { animation: sheetIn .28s cubic-bezier(.22,1,.36,1) forwards; }
        @keyframes sheetIn { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (min-width: 640px) { .animate-panel-in { animation: panelIn .28s cubic-bezier(.22,1,.36,1) forwards; } @keyframes panelIn { from { transform: translateX(100%) } to { transform: translateX(0) } } }
        .animate-bump { animation: bump .22s cubic-bezier(.34,1.56,.64,1); display:inline-block; }
        @keyframes bump { 0%{ transform: scale(1) } 50%{ transform: scale(1.15) } 100%{ transform: scale(1) } }
        .animate-total-pop { animation: totalPop .28s cubic-bezier(.22,1,.36,1); }
        @keyframes totalPop { 0%{ transform: scale(.98); opacity:.9 } 100%{ transform: scale(1); opacity:1 } }
      `}</style>
    </div>
  );
};

export default CartDrawer;
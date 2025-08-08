'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { MenuItem } from './MenuItemCard';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  items: MenuItem[];                 // usually 2; handles 1 gracefully
  isRTL: boolean;
  currency: Intl.NumberFormat;
  onClose: () => void;
  onAddToCart: (item: MenuItem) => void;

  // optional cart controls
  onRemoveFromCart?: (id: string) => void;
  quantityMap?: Record<string, number>;
}

type Chip = { text: string; kind: 'common' | 'unique' };

const normalizeToken = (s: string) =>
  s.toLowerCase()
    .normalize('NFKD')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const splitIngredients = (s: string) =>
  s ? s.split(/•|,|\/|;|\||·/g).map(x => x.trim()).filter(Boolean) : [];

function diffIngredientTokens(aStr: string, bStr: string): { A: Chip[]; B: Chip[] } {
  const aTokens = splitIngredients(aStr);
  const bTokens = splitIngredients(bStr);
  const aNorm = new Set(aTokens.map(normalizeToken));
  const bNorm = new Set(bTokens.map(normalizeToken));
  const common = new Set<string>();
  aNorm.forEach(n => bNorm.has(n) && common.add(n));
  return {
    A: aTokens.map(txt => ({ text: txt, kind: common.has(normalizeToken(txt)) ? 'common' : 'unique' })),
    B: bTokens.map(txt => ({ text: txt, kind: common.has(normalizeToken(txt)) ? 'common' : 'unique' })),
  };
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Subtle emoji confetti (lighter than the original) */
function burstConfettiSoft(x: number, y: number, count = 10) {
  if (prefersReducedMotion()) return;
  const EMOJIS = ['🍔','🍕','🍟','🌯','🥙','🥗','🍤','🍣','🍩','🥤','🧄','🧀','🥑','🌶️','🍪'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.textContent = EMOJIS[(Math.random() * EMOJIS.length) | 0];
    el.style.position = 'fixed';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = `${14 + Math.random() * 10}px`;
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);

    const dx = (Math.random() - 0.5) * 160;
    const dy = -(40 + Math.random() * 90);
    const rot = (Math.random() - 0.5) * 180;

    el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 }
      ],
      { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.95,.4,1)' }
    ).onfinish = () => el.remove();
  }
}

/** Tiny floating "+N" pulse near a point */
function pulsePlus(x: number, y: number, text = '+2') {
  if (prefersReducedMotion()) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.position = 'fixed';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.transform = 'translate(-50%, -50%)';
  el.style.padding = '2px 6px';
  el.style.fontSize = '12px';
  el.style.fontWeight = '800';
  el.style.lineHeight = '1';
  el.style.color = 'white';
  el.style.background = 'rgba(16,185,129,.95)'; // emerald-ish
  el.style.borderRadius = '999px';
  el.style.boxShadow = '0 4px 10px rgba(0,0,0,.15)';
  el.style.zIndex = '10000';
  el.style.pointerEvents = 'none';
  document.body.appendChild(el);

  el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.9)', opacity: 0 },
      { transform: 'translate(-50%, -70%) scale(1.05)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -95%) scale(.98)', opacity: 0 }
    ],
    { duration: 700, easing: 'cubic-bezier(.2,.8,.3,1)' }
  ).onfinish = () => el.remove();
}

function ChipBadge({ chip }: { chip: Chip }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] leading-tight border whitespace-nowrap';
  const common = 'border-slate-300 bg-slate-50/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300';
  const unique = 'ring-2 ring-offset-1 ring-fuchsia-200 border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:ring-fuchsia-800/40 dark:border-fuchsia-700/60 dark:bg-fuchsia-900/30 dark:text-fuchsia-200';
  return (
    <span className={`${base} ${chip.kind === 'unique' ? unique : common}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${chip.kind === 'unique' ? 'bg-fuchsia-500' : 'bg-slate-400'}`} />
      {chip.text}
    </span>
  );
}

const CompareSheet: React.FC<Props> = ({
  items, isRTL, currency, onClose, onAddToCart, onRemoveFromCart, quantityMap
}) => {
  const { t } = useLanguage();
  const [onlyDiffs, setOnlyDiffs] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const a = items[0];
  const b = items[1];

  const aIngs = (a?.ingredients_details || [])
    .map(x => (isRTL ? x?.ingredient?.name_ar : x?.ingredient?.name_en))
    .filter(Boolean) as string[];
  const bIngs = (b?.ingredients_details || [])
    .map(x => (isRTL ? x?.ingredient?.name_ar : x?.ingredient?.name_en))
    .filter(Boolean) as string[];

  const { A: chipsAAll, B: chipsBAll } = useMemo(
    () => diffIngredientTokens(aIngs.join(' • '), bIngs.join(' • ')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aIngs.join('|'), bIngs.join('|')]
  );

  const chipsA = onlyDiffs ? chipsAAll.filter(c => c.kind === 'unique') : chipsAAll;
  const chipsB = onlyDiffs ? chipsBAll.filter(c => c.kind === 'unique') : chipsBAll;

  const displayA = isRTL ? a?.name_ar || a?.name_en : a?.name_en;
  const displayB = isRTL ? b?.name_ar || b?.name_en : b?.name_en;

  const qtyA = a ? (quantityMap?.[a.id] || 0) : 0;
  const qtyB = b ? (quantityMap?.[b.id] || 0) : 0;

  const handleAddBoth = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (a) onAddToCart(a);
    if (b) onAddToCart(b);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    burstConfettiSoft(cx, cy, 10);
    pulsePlus(cx, r.top - 6, '+2');
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* container */}
      <div className="absolute bottom-0 left-0 right-0 sm:inset-0 sm:m-auto sm:h-[86vh] sm:w-[min(1000px,95vw)] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* header */}
        <div className={`sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur ${isRTL ? 'rtl' : 'ltr'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="flex -space-x-3 rtl:space-x-reverse">
                <img src={a?.image_url || '/images/placeholder.png'} alt={displayA || ''} className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg object-cover ring-2 ring-white dark:ring-slate-900" loading="lazy" />
                <img src={b?.image_url || '/images/placeholder.png'} alt={displayB || ''} className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg object-cover ring-2 ring-white dark:ring-slate-900" loading="lazy" />
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {(displayA || t('menu.comparing') || 'Comparing')}
                  {displayB ? ` ${isRTL ? 'و' : '&'} ${displayB}` : ''}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {t('menu.compare') || 'Compare'}
                </div>
              </div>
            </div>

            {/* header controls: Only differences + close */}
            <div className="flex items-center gap-2 sm:gap-3">
              <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                <input
                  type="checkbox"
                  className="accent-emerald-600"
                  checked={onlyDiffs}
                  onChange={e => setOnlyDiffs(e.target.checked)}
                />
                {t('menu.onlyDifferences') || 'Only differences'}
              </label>
              <button
                onClick={onClose}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs sm:text-sm hover:opacity-90"
                aria-label={t('common.close') || 'Close'}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* body */}
        <div className={`p-4 sm:p-6 space-y-4 ${isRTL ? 'rtl' : 'ltr'}`}>
          {/* CTA row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {a && b
                ? (t('menu.compareTagline') || 'Spot the differences and pick your favorite.')
                : (t('menu.compareEmptyHint') || 'Pick another item to compare side by side.')}
            </div>
            <div className="flex flex-wrap gap-2">
              {a && (
                <button
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                  onClick={(e) => {
                    onAddToCart(a);
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    burstConfettiSoft(r.left + r.width / 2, r.top + r.height / 2, 6);
                  }}
                >
                  {t('menu.addToCart') || 'Add to cart'} {isRTL ? (a.name_ar || a.name_en ? `• ${a.name_ar || a.name_en}` : '') : (a.name_en ? `• ${a.name_en}` : '')}
                </button>
              )}
              {b && (
                <button
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                  onClick={(e) => {
                    onAddToCart(b);
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    burstConfettiSoft(r.left + r.width / 2, r.top + r.height / 2, 6);
                  }}
                >
                  {t('menu.addToCart') || 'Add to cart'} {isRTL ? (b.name_ar || b.name_en ? `• ${b.name_ar || b.name_en}` : '') : (b.name_en ? `• ${b.name_en}` : '')}
                </button>
              )}
              {a && b && (
                <button
                  className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-sm relative overflow-visible"
                  onClick={handleAddBoth}
                >
                  {t('menu.addBoth') || 'Add both'}
                </button>
              )}
            </div>
          </div>

          {/* layout: JUST TWO CARDS (desktop & mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MiniCard
              side="left"
              item={a}
              isRTL={isRTL}
              currency={currency}
              qty={a ? (quantityMap?.[a.id] || 0) : 0}
              add={onAddToCart}
              remove={onRemoveFromCart}
              chips={chipsA}
            />
            <MiniCard
              side="right"
              item={b}
              isRTL={isRTL}
              currency={currency}
              qty={b ? (quantityMap?.[b.id] || 0) : 0}
              add={onAddToCart}
              remove={onRemoveFromCart}
              chips={chipsB}
            />
          </div>
        </div>
      </div>

      <style>{`
        .rtl { direction: rtl; } .ltr { direction: ltr; }
      `}</style>
    </div>
  );
};

function MiniCard({
  side,
  item,
  isRTL,
  currency,
  add,
  remove,
  qty = 0,
  chips = [],
}: {
  side: 'left' | 'right';
  item?: MenuItem;
  isRTL: boolean;
  currency: Intl.NumberFormat;
  add: (m: MenuItem) => void;
  remove?: (id: string) => void;
  qty?: number;
  chips?: Chip[];
}) {
  const { t } = useLanguage();

  if (!item) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 sm:p-6 flex items-center justify-center text-slate-400 dark:text-slate-500">
        —
      </div>
    );
  }

  const name = isRTL ? item.name_ar || item.name_en : item.name_en;

  return (
    <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <img
        src={item.image_url || '/images/placeholder.png'}
        className="w-full h-16 sm:h-40 object-cover"
        alt={name || ''}
        loading="lazy"
      />

      <div className="p-3 sm:p-5">
        {/* title + price */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] sm:text-base font-semibold text-slate-900 dark:text-white truncate">{name}</div>
            <div className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400">
              {currency.format(item.price ?? 0)}
            </div>
          </div>
        </div>

        {/* INGREDIENT CHIPS (wrap inside the card) */}
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            {t('common.ingredients') || 'Ingredients'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.length
              ? chips.map((c, i) => <span key={`${c.text}-${i}`}><ChipBadge chip={c} /></span>)
              : <span className="text-xs text-slate-400">—</span>}
          </div>
        </div>

        {/* DESKTOP: stepper if in cart, else CTA */}
        {qty > 0 && remove ? (
          <div className="hidden sm:flex items-center justify-between mt-3 sm:mt-4">
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-3`}>
              <button
                className="w-9 h-9 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 active:scale-95"
                onClick={() => remove(item.id)}
                aria-label={t('common.decrease') || 'Decrease'}
              >
                −
              </button>
              <span className="min-w-[2rem] text-center font-bold">{qty}</span>
              <button
                className={`w-10 h-10 rounded-full text-white active:scale-95 ${side === 'left' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                onClick={() => add(item)}
                aria-label={t('common.increase') || 'Increase'}
              >
                +
              </button>
            </div>
          </div>
        ) : (
          <button
            className={`hidden sm:block w-full mt-3 sm:mt-4 rounded-xl ${side === 'left' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white py-2.5 text-sm shadow`}
            onClick={(e) => {
              add(item);
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              burstConfettiSoft(r.left + r.width / 2, r.top + r.height / 2, 6);
            }}
          >
            {side === 'left' ? '✓ ' : '+ '} {t('menu.addToCart') || 'Add to cart'}
          </button>
        )}

        {/* MOBILE: stepper or add pill */}
        <div className="mt-2 sm:mt-3">
          <div className="flex sm:hidden items-center justify-between">
            {qty > 0 && remove ? (
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-1.5`}>
                <button
                  className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 active:scale-95"
                  onClick={() => remove(item.id)}
                  aria-label="Decrease"
                >
                  −
                </button>
                <span className="min-w-[1.75rem] text-center font-semibold text-sm">{qty}</span>
                <button
                  className={`w-8 h-8 rounded-full text-white active:scale-95 ${side === 'left' ? 'bg-emerald-600' : 'bg-blue-600'}`}
                  onClick={() => add(item)}
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-white active:scale-95 ${side === 'left' ? 'bg-emerald-600' : 'bg-blue-600'}`}
                onClick={(e) => {
                  add(item);
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  burstConfettiSoft(r.left + r.width / 2, r.top + r.height / 2, 6);
                }}
              >
                + {t('menu.addToCart') || 'Add'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompareSheet;
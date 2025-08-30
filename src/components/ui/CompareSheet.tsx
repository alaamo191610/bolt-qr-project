'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MenuItem } from './MenuItemCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from "../../contexts/ThemeContext";

/* ===================== Types ===================== */
type IngredientDetail = { ingredient?: { id?: string; name_en?: string; name_ar?: string } };
type Chip = { text: string; kind: 'common' | 'unique' };
type FilterMode = 'all' | 'unique' | 'common';
type CompareBy = 'ingredients' | 'price' | 'nutrition' | 'dietary';

interface Props {
  items: MenuItem[];
  isRTL: boolean;
  currency: Intl.NumberFormat;
  onClose: () => void;

  // تحكم السلة داخل البطاقة
  onAddToCart: (item: MenuItem) => void;
  onRemoveFromCart?: (id: string) => void;
  quantityMap?: Record<string, number>;
}

/* ===================== Sheet layout ===================== */
/** مقدار المساحة من أعلى الشاشة (بالـ vh) — اللوحة تملأ الباقي */
const SHEET_TOP_VH = 9;

/* ===================== Utils ===================== */
const normalizeToken = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[./#!$%^&*;:{}=\-_`~()،؛]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function diffIngredientTokensFromDetails(
  aDetails?: IngredientDetail[],
  bDetails?: IngredientDetail[],
  isRTL?: boolean
): { A: Chip[]; B: Chip[] } {
  const a = (aDetails ?? []).map(x => ({ id: x.ingredient?.id, text: (isRTL ? x.ingredient?.name_ar : x.ingredient?.name_en) ?? '' }));
  const b = (bDetails ?? []).map(x => ({ id: x.ingredient?.id, text: (isRTL ? x.ingredient?.name_ar : x.ingredient?.name_en) ?? '' }));

  const aIds = new Set(a.map(x => x.id).filter(Boolean) as string[]);
  const bIds = new Set(b.map(x => x.id).filter(Boolean) as string[]);
  const hasIds = aIds.size > 0 || bIds.size > 0;

  const bText = new Set(b.map(x => normalizeToken(x.text)));
  const aText = new Set(a.map(x => normalizeToken(x.text)));

  const A: Chip[] = a.map(x => ({
    text: x.text,
    kind: (hasIds ? (x.id ? bIds.has(x.id) : bText.has(normalizeToken(x.text))) : bText.has(normalizeToken(x.text))) ? 'common' : 'unique'
  }));
  const B: Chip[] = b.map(x => ({
    text: x.text,
    kind: (hasIds ? (x.id ? aIds.has(x.id) : aText.has(normalizeToken(x.text))) : aText.has(normalizeToken(x.text))) ? 'common' : 'unique'
  }));

  return { A, B };
}

const unitTotal = (it?: MenuItem | null) =>
  it ? (it.price ?? 0) + (typeof (it as any).price_delta === 'number' ? (it as any).price_delta : 0) : null;

/* ===================== UI atoms ===================== */
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

/* ===================== MiniCard ===================== */
function MiniCard({
  side, item, isRTL, currency, by,
  qty = 0, add, remove, chips, filterMode
}: {
  side: 'left' | 'right';
  item?: MenuItem;
  isRTL: boolean;
  currency: Intl.NumberFormat;
  by: CompareBy;
  qty?: number;
  add: (m: MenuItem) => void;
  remove?: (id: string) => void;
  chips: Chip[];
  filterMode: FilterMode;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const { colors } = useTheme();

  if (!item) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-slate-400 dark:text-slate-500">
        {t('menu.compareEmptyHint') || 'Pick another item to compare.'}
      </div>
    );
  }

  const name = isRTL ? item.name_ar || item.name_en : item.name_en;
  const priceText = currency.format(unitTotal(item) || 0);

  const uniques = chips.filter(c => c.kind === 'unique');
  const commons = chips.filter(c => c.kind === 'common');
  const showUnique = by === 'ingredients' && filterMode !== 'common';
  const showCommon = by === 'ingredients' && filterMode !== 'unique';

  // Optional fields (non-breaking)
  const portionGrams = (item as any)?.portion_grams as number | undefined;
  const nutrition = (item as any)?.nutrition as { cal?: number; protein?: number; carbs?: number; fat?: number } | undefined;
  const tags = (item as any)?.tags as string[] | undefined;
  const allergens = (item as any)?.allergens as string[] | undefined;

  return (
    <article
      className="h-full flex flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Hero image with glass bar */}
      <div className="relative aspect-[16/9] w-full overflow-hidden shrink-0">
        <img
          src={item.image_url || '/images/placeholder.png'}
          alt={name || ''}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <div className="rounded-2xl bg-black/40 backdrop-blur px-3 py-2 text-white flex items-center justify-between gap-3">
            <h3 className="font-semibold truncate">{name}</h3>
            <div className="text-sm font-bold tabular-nums">{priceText}</div>
          </div>
        </div>
      </div>

      {/* Middle content per dimension */}
      <div className="px-4 pt-3">


        {by === 'price' && (
          <div className="grid grid-cols-2 gap-2 text-sm mb-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-slate-500 dark:text-slate-400">{t('menu.price') || 'Price'}</div>
              <div className="font-bold tabular-nums">{priceText}</div>
            </div>
            {portionGrams && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-slate-500 dark:text-slate-400">{t('menu.value') || 'QAR/100g'}</div>
                <div className="font-bold tabular-nums">
                  {((unitTotal(item) || 0) / (portionGrams / 100)).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}

        {by === 'nutrition' && nutrition && (
          <div className="grid grid-cols-4 gap-2 text-xs mb-2">
            {(['cal', 'protein', 'carbs', 'fat'] as const).map(key => (
              <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-center">
                <div className="text-slate-500 dark:text-slate-400">{t(`menu.${key}`) || key.toUpperCase()}</div>
                <div className="font-bold tabular-nums">{(nutrition as any)[key]}</div>
              </div>
            ))}
          </div>
        )}

        {by === 'dietary' && (
          <div className="mb-2">
            <div className="flex flex-wrap gap-1.5">
              {(tags ?? []).map(tag => (
                <span key={tag} className="px-2 py-1 rounded-full text-xs border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                  {tag}
                </span>
              ))}
            </div>
            {allergens?.length ? (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t('menu.contains') || 'Contains'}: {allergens.join(', ')}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Chips & controls */}
      <div className="p-4 sm:p-5 flex-1">
        {showUnique && (
          <section className="mb-3">
            <h4 className="text-[11px] font-semibold tracking-wide text-fuchsia-700 dark:text-fuchsia-300 mb-1">
              {t('menu.unique') || 'Unique'}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {uniques.length
                ? uniques.map((c, i) => <ChipBadge key={`u-${i}`} chip={c} />)
                : <span className="text-sm text-slate-500">{t('menu.none') || 'None'}</span>}
            </div>
          </section>
        )}

        {showCommon && (
          <section>
            <h4 className="text-[11px] font-semibold tracking-wide text-slate-600 dark:text-slate-300 mb-1">
              {t('menu.common') || 'Common'}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {commons.length
                ? commons.map((c, i) => <ChipBadge key={`c-${i}`} chip={c} />)
                : <span className="text-sm text-slate-500">{t('menu.none') || 'None'}</span>}
            </div>
          </section>
        )}

        {/* Unified stepper */}
        <div className={`mt-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {qty > 0 && remove ? (
            <div className={`flex w-full items-center ${isRTL ? 'flex-row-reverse' : ''} gap-2`}>
              <button
                onClick={() => remove(item.id)}
                className="inline-grid place-items-center flex-1 h-11 rounded-full border active:scale-95 hover:bg-slate-50 dark:hover:bg-slate-700"
                aria-label={t('common.decrease') || 'Decrease'}
                style={{ color: colors.primary, borderColor: colors.primary, background: 'white' }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /></svg>
              </button>
              <output className="w-12 shrink-0 text-center font-bold tabular-nums font-mono leading-none">{qty}</output>
              <button
                onClick={() => add(item)}
                className="inline-grid place-items-center flex-1 h-11 rounded-full text-white active:scale-95 shadow-sm hover:opacity-90"
                aria-label={t('common.increase') || 'Increase'}
                style={{ background: `linear-gradient(135deg, ${side === 'left' ? colors.primary : colors.secondary}, ${side === 'left' ? colors.secondary : colors.primary})` }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => add(item)}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold text-white shadow-sm active:scale-[.99] hover:opacity-90"
              aria-label={t('menu.addToCart') || 'Add to cart'}
              style={{ backgroundColor: side === 'left' ? colors.primary : colors.secondary }}
            >
              <span className="text-base leading-none">＋</span>
              {t('menu.addToCart') || 'Add to cart'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ===================== CompareSheet ===================== */
const CompareSheet: React.FC<Props> = ({
  items, isRTL, currency, onClose, onAddToCart, onRemoveFromCart, quantityMap
}) => {
  const { t } = useLanguage();
  const { colors } = useTheme();

  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    if (typeof window === 'undefined') return 'all';
    try { return (localStorage.getItem('compare_filter_mode') as FilterMode) || 'all'; }
    catch { return 'all'; }
  });
  const [by, setBy] = useState<CompareBy>('ingredients');

  const a = items[0];
  const b = items[1];

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // قفل تمرير الخلفية + اختصارات لوحة المفاتيح
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      const k = e.key.toLowerCase();
      if (k === 'a') setFilterMode('all');
      if (k === 'u') setFilterMode('unique');
      if (k === 'c') setFilterMode('common');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => { try { localStorage.setItem('compare_filter_mode', filterMode); } catch { } }, [filterMode]);

  // حساب الشرائح
  const { A: chipsAAll, B: chipsBAll } = useMemo(
    () => diffIngredientTokensFromDetails(a?.ingredients_details as any, b?.ingredients_details as any, isRTL),
    [a?.ingredients_details, b?.ingredients_details, isRTL]
  );

  // Counters
  const uniqueCount =
    chipsAAll.filter(c => c.kind === 'unique').length +
    chipsBAll.filter(c => c.kind === 'unique').length;

  const commonCount = chipsAAll.filter(c => c.kind === 'common').length; // المجموعة المشتركة مرة واحدة
  const allCount = uniqueCount + commonCount;

  // filter for current mode
  const sortChips = (arr: Chip[]) => [...arr].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'unique' ? -1 : 1));
  const filterChips = (arr: Chip[], mode: FilterMode) => (mode === 'all' ? sortChips(arr) : arr.filter(c => c.kind === mode));
  const chipsA = filterChips(chipsAAll, filterMode);
  const chipsB = filterChips(chipsBAll, filterMode);

  const displayA = isRTL ? a?.name_ar || a?.name_en : a?.name_en;
  const displayB = isRTL ? b?.name_ar || b?.name_en : b?.name_en;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* خلفية */}
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-label={t('common.close') || 'Close'} />

      {/* Sheet */}
      <div
        ref={panelRef}
        id="compare-bar"
        className="absolute left-0 right-0 bottom-0 rounded-t-[36px] shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 outline-none flex flex-col overflow-hidden overflow-x-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        tabIndex={-1}
        style={{ top: `${SHEET_TOP_VH}vh` }}
      >
        {/* ===== Header ===== */}
        <header className="px-4 sm:px-6 pt-4 pb-2 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/92 dark:bg-slate-900/92 backdrop-blur">
          {/* row 1: title */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3 rtl:space-x-reverse">
                  <img src={a?.image_url || '/images/placeholder.png'} alt={displayA || ''} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover ring-2 ring-white dark:ring-slate-900" />
                  <img src={b?.image_url || '/images/placeholder.png'} alt={displayB || ''} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover ring-2 ring-white dark:ring-slate-900" />
                </div>
                <h2 id="compare-title" className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  {t('menu.comparing') || 'Comparing'}
                </h2>
              </div>
              <div className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 truncate" dir={isRTL ? 'rtl' : 'ltr'}>
                {(displayA || t('menu.itemA') || 'Item A')}
                {displayB ? (isRTL ? ' و ' : ' & ') + displayB : ''}
              </div>
            </div>

            <button
              onClick={onClose}
              className="grid place-items-center w-9 h-9 rounded-full bg-slate-900 text-white text-sm hover:opacity-90 shrink-0"
              aria-label={t('common.close') || 'Close'}
            >
              ✕
            </button>
          </div>

          {/* row 2: Compare-by switch */}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-md mx-auto" role="tablist">
            {(['ingredients', 'price', 'nutrition', 'dietary'] as CompareBy[]).map(k => (
              <button
                key={k}
                onClick={() => setBy(k)}
                aria-pressed={by === k}
                className={`h-10 rounded-full text-xs font-semibold border transition w-full
                 ${by === k
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 border-slate-300 dark:border-slate-700'
                  }`}
              >
                {t(`menu.by.${k}`) || k}
              </button>
            ))}
          </div>


          {/* row 3: filters (only for ingredients) */}
          {by === 'ingredients' && (
            <div className="mt-3 flex items-center justify-center">
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() => setFilterMode('all')}
                  aria-pressed={filterMode === 'all'}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition ${filterMode === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                    : 'bg-white text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                    }`}
                >
                  {(t('menu.all') || 'All')} <span className="opacity-70">({allCount})</span>
                </button>
                <button
                  onClick={() => setFilterMode('unique')}
                  aria-pressed={filterMode === 'unique'}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition ${filterMode === 'unique'
                    ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                    : 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-200 dark:border-fuchsia-700/60'
                    }`}
                >
                  {(t('menu.unique') || 'Unique')} <span className="opacity-80">({uniqueCount})</span>
                </button>
                <button
                  onClick={() => setFilterMode('common')}
                  aria-pressed={filterMode === 'common'}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition ${filterMode === 'common'
                    ? 'bg-slate-700 text-white border-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
                    : 'bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700'
                    }`}
                >
                  {(t('menu.common') || 'Common')} <span className="opacity-80">({commonCount})</span>
                </button>
              </div>
            </div>
          )}

          {/* row 4: tagline */}
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-300 text-center">
            {t('menu.compareTagline') || 'Spot the differences and pick your favorite.'} <span className="align-middle">❤️</span>
          </div>
        </header>

        {/* ===== Body (scrollable, always side-by-side, compact) ===== */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-28" dir={isRTL ? 'rtl' : 'ltr'}>
          <div
            className="
      grid grid-cols-2 gap-2 xs:gap-3 sm:gap-4
      max-w-[min(100vw,700px)]
      mx-auto
      items-stretch
      min-w-0
    "
          >
            <div className="min-w-0">
              <MiniCard
                side="left"
                by={by}
                item={a}
                isRTL={isRTL}
                currency={currency}
                qty={a ? quantityMap?.[a.id] ?? 0 : 0}
                add={onAddToCart}
                remove={onRemoveFromCart}
                chips={chipsA}
                filterMode={filterMode}
                compact
              />
            </div>

            <div className="min-w-0">
              <MiniCard
                side="right"
                by={by}
                item={b}
                isRTL={isRTL}
                currency={currency}
                qty={b ? quantityMap?.[b.id] ?? 0 : 0}
                add={onAddToCart}
                remove={onRemoveFromCart}
                chips={chipsB}
                filterMode={filterMode}
                compact
              />
            </div>
          </div>
        </div>



        {/* ===== Footer: Take both ===== */}
        {a && b && (
          <footer className="sticky bottom-0 px-4 sm:px-6 py-3 bg-white/92 dark:bg-slate-900/92 backdrop-blur border-t border-slate-200 dark:border-slate-800">
            <div className="max-w-[680px] mx-auto">
              <p id="take-both-hint" className="sr-only">{t('menu.addBothHint') || 'Adds both items to the cart'}</p>
              <button
                onClick={() => { onAddToCart(a); onAddToCart(b); }}
                aria-describedby="take-both-hint"
                aria-label={t('menu.addBoth') || 'Add both'}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-extrabold text-white shadow-[0_10px_22px_rgba(0,0,0,.15)] hover:opacity-90 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-300"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }}
              >
                <span className="text-lg">🛒</span>
                {t('menu.addBoth') || 'Add both'}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default CompareSheet;

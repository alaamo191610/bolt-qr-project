import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus, ChevronDown, ChevronUp, Info, Scale, X, Search, RefreshCw, Star, Filter } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Ingredient { id: string; name_en: string; name_ar: string; extra_price?: number }
interface Modifier { id: string; name_en: string; name_ar: string; price?: number }

export interface MenuItem {
  id: string;
  name_en: string;
  name_ar?: string;
  price: number;
  image_url?: string;
  available?: boolean;
  created_at?: string;
  category_id?: string;
  ingredients_details?: { ingredient: Ingredient }[];
  categories?: { id: string; name_en: string; name_ar: string };

  // optional/legacy
  modifiers?: Modifier[];
  selected_modifiers?: string[];
  notes?: string;

  // ingredient-driven customization
  custom_ingredients?: { id: string; action: 'normal' | 'no' | 'extra' }[];
  price_delta?: number;
}

interface Props {
  item: MenuItem;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
  currency?: Intl.NumberFormat;

  // compare (optional)
  onToggleCompare?: (id: string) => void;
  compareSelected?: boolean;
  compareDisabled?: boolean;
  showCompareChip?: boolean;
}

/* ---------------- analytics tiny helper ---------------- */
function track(name: string, props?: Record<string, unknown>) {
  try { (window as any).dataLayer?.push({ event: name, ...props }); } catch {}
  try { window.dispatchEvent(new CustomEvent('analytics:event', { detail: { name, props } })); } catch {}
}

/* ---------------- fly-to-cart helpers ---------------- */
function onAnimationFinish(a: Animation): Promise<void> {
  const finished = (a as any).finished as Promise<Animation> | undefined;
  if (finished?.then) return finished.then(() => undefined).catch(() => undefined);
  return new Promise<void>((resolve) => {
    const handler = (_ev: AnimationPlaybackEvent) => { a.removeEventListener('finish', handler as EventListener); resolve(); };
    a.addEventListener('finish', handler as EventListener, { once: true });
  });
}

async function ensureCartAnchor(isRTL: boolean, timeout = 700): Promise<{ el: HTMLElement; isTemp: boolean }> {
  const CANDIDATES = ['header-cart-anchor', 'floating-cart-anchor'];
  for (const id of CANDIDATES) {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) return { el, isTemp: false };
  }
  const found = await new Promise<HTMLElement | null>((resolve) => {
    const obs = new MutationObserver(() => {
      for (const id of CANDIDATES) {
        const hit = document.getElementById(id) as HTMLElement | null;
        if (hit) { obs.disconnect(); resolve(hit); return; }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
  if (found) return { el: found, isTemp: false };

  const temp = document.createElement('div');
  temp.id = 'header-cart-anchor';
  temp.setAttribute('data-cart-anchor', 'header-temp');
  temp.style.position = 'fixed';
  temp.style.top = '16px';
  (isRTL ? (temp.style.left = '16px') : (temp.style.right = '16px'));
  temp.style.width = '1px';
  temp.style.height = '1px';
  temp.style.pointerEvents = 'none';
  temp.style.opacity = '0';
  temp.style.zIndex = '1';
  document.body.appendChild(temp);
  return { el: temp, isTemp: true };
}

async function flyToHeaderFromRect(
  startRect: DOMRect | { left: number; top: number; width: number; height: number },
  isRTL: boolean
) {
  const { el: anchor, isTemp } = await ensureCartAnchor(isRTL, 700);
  const endRect = anchor.getBoundingClientRect();
  const startX = startRect.left + startRect.width / 2;
  const startY = startRect.top;
  const endX = endRect.left + endRect.width / 2;
  const endY = endRect.top + endRect.height / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  const lift = Math.min(140, Math.hypot(dx, dy) / 2.5);
  const midX = startX + dx * 0.5;
  const midY = startY + dy * 0.5 - lift;
  const EMOJIS = ['🍔','🍕','🍟','🌯','🥙','🥗','🍤','🍣','🍰','🥤'];
  const emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
  const bubble = document.createElement('div');
  bubble.textContent = emoji;
  bubble.style.position = 'fixed';
  bubble.style.left = `${startX}px`;
  bubble.style.top = `${startY}px`;
  bubble.style.zIndex = '9999';
  bubble.style.fontSize = '26px';
  bubble.style.pointerEvents = 'none';
  bubble.style.willChange = 'transform, opacity';
  document.body.appendChild(bubble);
  const anim = bubble.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${midX - startX}px, ${midY - startY}px) scale(0.9)`, opacity: 0.9, offset: 0.55 },
      { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.66)`, opacity: 0.2, offset: 1 }
    ],
    { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
  await onAnimationFinish(anim);
  bubble.remove();
  if (isTemp) anchor.remove();
}

/* ---------------- component ---------------- */
const MenuItemCard: React.FC<Props> = ({
  item,
  quantity,
  onAdd,
  onRemove,
  currency,
  onToggleCompare,
  compareSelected = false,
  compareDisabled = false,
  showCompareChip = false,
}) => {
  const { t, isRTL } = useLanguage();
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [mounted, setMounted] = useState(false); // portal guard
  const [notes, setNotes] = useState<string>(item.notes || '');
  const [activeTab, setActiveTab] = useState<'ingredients' | 'notes'>('ingredients');

  useEffect(() => { setMounted(true); }, []);

  const ingList: Ingredient[] = useMemo(
    () => (item.ingredients_details ?? []).map(d => d.ingredient).filter(Boolean),
    [item.ingredients_details]
  );

  // tri-state per ingredient
  const [ingChoice, setIngChoice] = useState<Record<string, 'no' | 'normal' | 'extra'>>(() => {
    const init: Record<string, 'no' | 'normal' | 'extra'> = {};
    ingList.forEach(i => { init[i.id] = 'normal'; });
    return init;
  });

  // local UI helpers
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);

  const isAvailable = item.available !== false;
  const priceFmt = useMemo(
    () => currency ?? new Intl.NumberFormat(isRTL ? 'ar-QA' : 'en-QA', { style: 'currency', currency: 'QAR' }),
    [currency, isRTL]
  );
  const displayName = isRTL ? item.name_ar || item.name_en : item.name_en;

  const extrasTotal = useMemo(
    () => ingList.reduce((sum, i) => sum + (ingChoice[i.id] === 'extra' ? (i.extra_price ?? 0) : 0), 0),
    [ingList, ingChoice]
  );

  const anyPaidExtra = useMemo(() => ingList.some(i => (i.extra_price ?? 0) > 0), [ingList]);

  const selectedSummary = useMemo(() => {
    const noNames: string[] = [];
    const extraNames: string[] = [];
    for (const ing of ingList) {
      const action = ingChoice[ing.id];
      const name = (isRTL ? ing.name_ar : ing.name_en) || '';
      if (action === 'no') noNames.push(name);
      if (action === 'extra') {
        const ep = ing.extra_price ?? 0;
        extraNames.push(ep > 0 ? `${name} (+${priceFmt.format(ep)})` : name);
      }
    }
    return { noNames, extraNames };
  }, [ingList, ingChoice, isRTL, priceFmt]);

  const filteredIng = useMemo(() => {
    let list = ingList;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(i => ((isRTL ? i.name_ar : i.name_en) || '').toLowerCase().includes(q));
    }
    if (onlySelected) {
      list = list.filter(i => ingChoice[i.id] !== 'normal');
    }
    return list;
  }, [ingList, query, onlySelected, ingChoice, isRTL]);

  const addWithOptions = (rect?: DOMRect) => {
    const custom_ingredients = ingList.map(i => ({ id: i.id, action: ingChoice[i.id] }));
    const selected_modifiers = ingList.flatMap(i => {
      const a = ingChoice[i.id];
      if (a === 'no') return [`ing:${i.id}:no`];
      if (a === 'extra') return [`ing:${i.id}:extra`];
      return [];
    });
    const payload: MenuItem = {
      ...item,
      selected_modifiers,
      custom_ingredients,
      price_delta: extrasTotal,
      notes,
    };
    onAdd(payload);
    track('customize_add', { item_id: item.id, extras_total: extrasTotal, has_notes: !!notes, no_count: selectedSummary.noNames.length, extra_count: selectedSummary.extraNames.length });
    if (rect) requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
    setCustomizing(false);
  };

  // modal niceties
  useEffect(() => {
    if (!customizing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCustomizing(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [customizing]);

  // quick actions
  const resetAll = () => {
    const next: Record<string, 'no' | 'normal' | 'extra'> = {};
    ingList.forEach(i => { next[i.id] = 'normal'; });
    setIngChoice(next);
    track('customize_quick_reset', { item_id: item.id });
  };
  const removeAll = () => {
    const next: Record<string, 'no' | 'normal' | 'extra'> = {};
    ingList.forEach(i => { next[i.id] = 'no'; });
    setIngChoice(next);
    track('customize_quick_remove_all', { item_id: item.id });
  };
  const extraAll = () => {
    if (!anyPaidExtra) return;
    const next: Record<string, 'no' | 'normal' | 'extra'> = {};
    ingList.forEach(i => { next[i.id] = (i.extra_price ?? 0) > 0 ? 'extra' : 'normal'; });
    setIngChoice(next);
    track('customize_quick_extra_all', { item_id: item.id });
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="group relative h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg [content-visibility:auto] [contain-intrinsic-size:340px_420px]">
      <div className="flex md:flex-col h-full">
        {/* Image */}
        <div className="relative">
          {/* Hide compare while modal is open to avoid overlap */}
          {!customizing && showCompareChip && onToggleCompare && (
            <button
              type="button"
              onClick={() => { onToggleCompare(item.id); track('compare_toggle', { item_id: item.id, selected: !compareSelected }); }}
              disabled={compareDisabled && !compareSelected}
              aria-pressed={compareSelected}
              aria-label={compareSelected ? (t('menu.comparing') || 'Comparing') : (t('menu.compare') || 'Compare')}
              title={
                compareDisabled && !compareSelected
                  ? (t('menu.compareLimit') || 'You can compare up to 2 items')
                  : compareSelected
                  ? (t('menu.comparing') || 'Comparing')
                  : (t('menu.compare') || 'Compare')
              }
              className={[
                'absolute top-3 z-10 rounded-full border px-2 py-1 text-xs font-medium shadow-sm',
                isRTL ? 'left-3' : 'right-3',
                compareSelected
                  ? 'bg-primary text-white border-primary'
                  : compareDisabled
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              <span className="inline-flex items-center gap-1"><Scale className="w-3.5 h-3.5" /><span className="hidden sm:inline">{compareSelected ? (t('menu.comparing') || 'Comparing') : (t('menu.compare') || 'Compare')}</span></span>
            </button>
          )}

          <img
            src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400'}
            alt={displayName}
            loading="lazy" decoding="async" referrerPolicy="no-referrer"
            className="w-24 h-24 sm:w-44 sm:h-44 md:w-full md:h-48 object-cover flex-shrink-0"
          />

          {item.available === false && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] grid place-items-center">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500 text-white shadow">{isRTL ? 'غير متاح' : 'Sold out'}</span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="steam-line" /><span className="steam-line delay-150" /><span className="steam-line delay-300" />
            </div>
          </div>
          <div className="absolute top-3 left-3 -rotate-6">
            <span className="inline-flex items-center rounded-md bg-amber-400 px-2 py-1 text-xs font-extrabold text-slate-900 shadow-md ring-1 ring-amber-500/30 price-pop">
              {priceFmt.format(item.price || 0)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">{displayName}</h3>

          {!!(item.ingredients_details?.length) && (
            <div className={`${isRTL ? 'text-right' : ''} mb-2`}>
              <button
                onClick={() => { setOpen(v => !v); track('ingredients_toggle', { item_id: item.id, open: !open }); }}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                aria-expanded={open}
              >
                <Info className="w-3.5 h-3.5" />
                {open ? t('common.ingredientsHide') : t('common.ingredients')}
                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {open && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ingList.map((i) => (
                    <span key={i.id} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                      {(isRTL ? i.name_ar : i.name_en) || ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {item.categories && (
            <span className="mt-1 inline-flex w-fit text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              {isRTL ? item.categories.name_ar : item.categories.name_en}
            </span>
          )}

          <div className="mt-auto pt-4">
            {quantity > 0 ? (
              <div className={`${isRTL ? 'flex-row-reverse' : ''} flex items-center justify-between`}>
                <div className={`${isRTL ? 'space-x-reverse' : ''} flex items-center space-x-2`}>
                  <button
                    onClick={() => { onRemove(item.id); track('remove_from_cart', { item_id: item.id, qty_after: quantity - 1 }); }}
                    className="w-10 h-10 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-full flex items-center justify-center transition-transform duration-150 active:scale-95"
                    aria-label={t('common.decrease')}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-base min-w-[2rem] text-center text-slate-900 dark:text-white" aria-live="polite">{quantity}</span>
                  <button
                    onClick={(e) => {
                      if (!isAvailable) return;
                      const btn = e.currentTarget as HTMLElement;
                      const rect = btn.getBoundingClientRect();
                      onAdd(item);
                      track('add_to_cart', { item_id: item.id, qty_after: quantity + 1 });
                      requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
                    }}
                    disabled={!isAvailable}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-150 shadow-lg active:scale-95 ${isAvailable ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                    aria-label={t('common.increase')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => { setCustomizing(true); setActiveTab('ingredients'); track('customize_open', { item_id: item.id }); }}
                  disabled={!isAvailable}
                  className={`hidden sm:inline-flex items-center px-3 py-2 rounded-lg text-xs font-medium border transition ${isAvailable ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 text-slate-400 cursor-not-allowed'}`}
                >
                  {isRTL ? 'تخصيص' : 'Customize'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => {
                    if (!isAvailable) return;
                    const btn = e.currentTarget as HTMLElement;
                    const rect = btn.getBoundingClientRect();
                    onAdd(item);
                    track('add_to_cart', { item_id: item.id, qty_after: 1 });
                    requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
                  }}
                  disabled={!isAvailable}
                  className={`px-4 py-3 rounded-xl transition-transform duration-150 font-medium text-sm shadow-lg active:scale-95 ${isAvailable ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                >
                  {t('menu.addToCart')}
                </button>
                <button
                  onClick={() => { setCustomizing(true); setActiveTab('ingredients'); track('customize_open', { item_id: item.id }); }}
                  disabled={!isAvailable}
                  className={`px-4 py-3 rounded-xl font-medium text-sm border transition ${isAvailable ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 text-slate-400 cursor-not-allowed'}`}
                >
                  {isRTL ? 'تخصيص' : 'Customize'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- CUSTOMIZE MODAL (portal) ---------------- */}
      {customizing && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
              <div
                className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=200'}
                      alt={displayName}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{displayName}</h4>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {isRTL ? 'السعر الأساسي' : 'Base'}: <strong>{priceFmt.format(item.price || 0)}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 inline-flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 text-xs px-2 py-1">
                      {isRTL ? 'إضافات' : 'Extras'}: <strong>{priceFmt.format(extrasTotal)}</strong>
                    </span>
                    <button onClick={() => setCustomizing(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={isRTL ? 'إغلاق' : 'Close'}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="px-3 pt-3">
                  <div className={`flex ${isRTL ? 'flex-row-reverse' : ''} bg-slate-100 dark:bg-slate-700 rounded-xl p-1 w-fit`}>
                    {(['ingredients','notes'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={[
                          'px-3 py-1.5 text-xs font-medium rounded-lg transition',
                          activeTab === tab ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow' : 'text-slate-600 dark:text-slate-300'
                        ].join(' ')}
                        aria-pressed={activeTab === tab}
                      >
                        {tab === 'ingredients' ? (isRTL ? 'المكوّنات' : 'Ingredients') : (isRTL ? 'ملاحظات' : 'Notes')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary chips */}
                {(selectedSummary.noNames.length > 0 || selectedSummary.extraNames.length > 0) && activeTab === 'ingredients' && (
                  <div className="px-4 pt-3">
                    <div className={`text-[11px] ${isRTL ? 'text-right' : ''} text-slate-500 mb-1`}>{isRTL ? 'التغييرات الحالية:' : 'Current changes:'}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSummary.noNames.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200">
                          {isRTL ? 'بدون:' : 'No:'} {selectedSummary.noNames.join(', ')}
                        </span>
                      )}
                      {selectedSummary.extraNames.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                          {isRTL ? 'إضافي:' : 'Extra:'} {selectedSummary.extraNames.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Tools row */}
                {activeTab === 'ingredients' && (
                  <div className="px-4 pt-3 flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className={`w-4 h-4 text-slate-400 absolute top-2.5 ${isRTL ? 'right-2' : 'left-2'}`} />
                      <input
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); track('customize_search', { item_id: item.id, qlen: e.target.value.length }); }}
                        placeholder={isRTL ? 'ابحث في المكوّنات' : 'Search ingredients'}
                        className={`w-full ${isRTL ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500`}
                      />
                    </div>
                    <button
                      onClick={() => { const v = !onlySelected; setOnlySelected(v); track('customize_selected_only_toggle', { item_id: item.id, value: v }); }}
                      className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs transition ${onlySelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      {onlySelected ? (isRTL ? 'المحددة فقط' : 'Selected only') : (isRTL ? 'الكل' : 'All')}
                    </button>
                  </div>
                )}

                {/* Quick actions */}
                {activeTab === 'ingredients' && (
                  <div className="px-4 pt-2 flex items-center gap-2 flex-wrap">
                    <button onClick={resetAll} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600">
                      <RefreshCw className="w-3.5 h-3.5" /> {isRTL ? 'إعادة الضبط' : 'Reset'}
                    </button>
                    <button onClick={removeAll} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200 hover:bg-red-100">
                      <X className="w-3.5 h-3.5" /> {isRTL ? 'إزالة الكل' : 'Remove all'}
                    </button>
                    <button
                      onClick={extraAll}
                      disabled={!anyPaidExtra}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${anyPaidExtra ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200 hover:bg-amber-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                      title={anyPaidExtra ? undefined : (isRTL ? 'لا توجد إضافات مدفوعة' : 'No paid extras')}
                    >
                      <Star className="w-3.5 h-3.5" /> {isRTL ? (anyPaidExtra ? 'إضافة الكل (مدفوع)' : 'إضافة الكل') : (anyPaidExtra ? 'Extra all (paid)' : 'Extra all')}
                    </button>
                  </div>
                )}

                {/* Body */}
                <div className="px-4 py-3 max-h-[58vh] overflow-auto">
                  {activeTab === 'ingredients' ? (
                    filteredIng.length ? (
                      <div className="space-y-3">
                        {filteredIng.map((ing) => {
                          const choice = ingChoice[ing.id] || 'normal';
                          return (
                            <div key={ing.id} className="border border-slate-200 dark:border-slate-600 rounded-xl p-3 hover:border-emerald-400/60 transition">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                  {(isRTL ? ing.name_ar : ing.name_en) || ''}
                                </div>
                                {(ing.extra_price ?? 0) > 0 && (
                                  <span className="text-[11px] text-slate-500">{isRTL ? 'سعر الإضافة' : 'Extra'}: {priceFmt.format(ing.extra_price!)}</span>
                                )}
                              </div>
                              <div role="radiogroup" aria-label={isRTL ? 'اختيار المكوّن' : 'Ingredient choice'} className={`mt-2 grid grid-cols-3 gap-2 ${isRTL ? 'direction-rtl' : ''}`}>
                                {(['no','normal','extra'] as const).map((val) => (
                                  <label
                                    key={val}
                                    data-variant={val}
                                    className={['seg', choice === val ? 'seg--active' : ''].join(' ')}
                                  >
                                    <input
                                      type="radio"
                                      name={`ing-${ing.id}`}
                                      value={val}
                                      checked={choice === val}
                                      onChange={() => setIngChoice(prev => ({ ...prev, [ing.id]: val }))}
                                      className="sr-only"
                                    />
                                    <span className="seg__label">
                                      {val === 'no' ? (isRTL ? 'بدون' : 'No') : val === 'normal' ? (isRTL ? 'عادي' : 'Normal') : (isRTL ? 'إضافي' : 'Extra')}
                                    </span>
                                    {val === 'extra' && (ing.extra_price ?? 0) > 0 && (
                                      <span className="seg__meta">+ {priceFmt.format(ing.extra_price ?? 0)}</span>
                                    )}
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">{query ? (isRTL ? 'لا توجد نتائج مطابقة' : 'No matches') : (isRTL ? 'لا توجد مكوّنات قابلة للتخصيص' : 'No customizable ingredients')}</div>
                    )
                  ) : (
                    <div>
                      <label className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1 block">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full min-h-[120px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder={isRTL ? 'مثال: بدون بصل / صلصة إضافية' : 'e.g., no onions / extra sauce'}
                      />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 sticky bottom-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur z-10">
                  <div className="text-[12px] text-slate-600 dark:text-slate-400">
                    {isRTL ? 'الإجمالي' : 'Total'}: <strong>{priceFmt.format((item.price || 0) + extrasTotal)}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCustomizing(false)} className="px-4 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      {isRTL ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        addWithOptions(rect);
                      }}
                      className="px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                    >
                      {isRTL ? `أضف — ${priceFmt.format((item.price || 0) + extrasTotal)}` : `Add — ${priceFmt.format((item.price || 0) + extrasTotal)}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* local styles */}
      <style>{`
        .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .price-pop { transform: translateZ(0); }
        .group:hover .price-pop { animation: pricePop .5s cubic-bezier(.22,1,.36,1); }
        @keyframes pricePop { 0% { transform: rotate(-6deg) scale(1); } 30% { transform: rotate(-3deg) scale(1.08); } 100% { transform: rotate(-6deg) scale(1); } }
        .steam-line { width:6px; height:14px; background: linear-gradient(to top, rgba(16,185,129,0.15), rgba(16,185,129,0.05)); border-radius: 999px; filter: blur(1px); animation: steam 1.8s ease-in-out infinite; }
        .steam-line.delay-150 { animation-delay:.15s; } .steam-line.delay-300 { animation-delay:.3s; }
        @keyframes steam { 0% { transform: translateY(6px) scaleX(1); opacity: 0; } 25% { opacity: .8; } 100% { transform: translateY(-12px) scaleX(0.6); opacity: 0; } }

        /* segmented control */
        .seg{
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          border:1px solid var(--seg-b, rgb(203 213 225));border-radius:12px;
          padding:.55rem .75rem;background:var(--seg-bg,#fff);
          color:var(--seg-fg,rgb(51 65 85));transition:all .18s ease
        }
        .dark .seg{--seg-bg:rgb(30 41 59);--seg-b:rgb(71 85 105);--seg-fg:rgb(226 232 240)}
        .seg:hover{transform:translateY(-1px)}
        .seg__label{font-size:12px;font-weight:700}
        .seg__meta{font-size:10px;color:rgb(100 116 139)} .dark .seg__meta{color:rgb(148 163 184)}
        .seg--active{box-shadow:0 4px 12px rgba(0,0,0,.06)}
        .seg--active[data-variant="no"]     { --seg-bg:#fef2f2; --seg-b:#fca5a5; --seg-fg:#b91c1c; border-color:var(--seg-b); color:var(--seg-fg); }
        .seg--active[data-variant="normal"] { --seg-bg:#eef2ff; --seg-b:#c7d2fe; --seg-fg:#3730a3; border-color:var(--seg-b); color:var(--seg-fg); }
        .seg--active[data-variant="extra"]  { --seg-bg:#ecfdf5; --seg-b:#34d399; --seg-fg:#047857; border-color:var(--seg-b); color:var(--seg-fg); }
      `}</style>
    </div>
  );
};

export default MenuItemCard;

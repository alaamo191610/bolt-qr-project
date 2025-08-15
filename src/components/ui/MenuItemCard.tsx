import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus, Info, ChevronDown, ChevronUp, ArrowLeft, X, RefreshCw, Star, Scale } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

/* ---------- Types ---------- */
interface Ingredient { id: string; name_en: string; name_ar: string; extra_price?: number }
interface Modifier { id: string; name_en: string; name_ar: string; price?: number }

export interface MenuItem {
  id: string;
  name_en: string;
  name_ar?: string;
  description_en?: string
  description_ar?: string
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

  // Compare (optional)
  onToggleCompare?: (id: string) => void;
  compareSelected?: boolean;
  compareDisabled?: boolean;
  showCompareChip?: boolean;
}

/* ---------- helpers ---------- */
function track(name: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try { (window as any).dataLayer?.push({ event: name, ...props }); } catch { }
  try { window.dispatchEvent(new CustomEvent('analytics:event', { detail: { name, props } })); } catch { }
}


function onAnimationFinish(a: Animation) {
  const f = (a as any).finished as Promise<Animation> | undefined;
  return f?.then(() => { }) ?? new Promise<void>(r => a.addEventListener('finish', () => r(), { once: true }));
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
  const EMOJIS = ['🍔', '🍕', '🍟', '🌯', '🥙', '🥗', '🍤', '🍣', '🍰', '🥤'];
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const bubble = document.createElement('div');
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const inView = endRect.top >= 0 && endRect.left >= 0 && endRect.left <= viewport.w && endRect.top <= viewport.h;
  if (!inView) return; // or fallback to pulse only

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

/* ---------- component ---------- */
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

  // Full-screen “page”
  const [openPage, setOpenPage] = useState(false);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);
  const panelScrollRef = React.useRef<HTMLDivElement | null>(null);
  // Tiny cache to avoid repeated confetti per item
  const addedOnceRef = React.useRef<Set<string>>(new Set());
  const FALLBACK_400 = "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400"

  // Prefer-reduced-motion flag (read once)
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;



  // Ingredients & notes
  const ingList: Ingredient[] = useMemo(
    () =>
      (item.ingredients_details ?? [])
        .map(d => d?.ingredient)
        .filter((x): x is Ingredient => !!(x && x.id))
        .map(i => ({
          ...i,
          extra_price:
            typeof i.extra_price === 'number'
              ? i.extra_price
              : Number.parseFloat(String(i.extra_price ?? '0')) || 0,
        })),
    [item.ingredients_details]
  );

  const [ingChoice, setIngChoice] = useState<Record<string, 'no' | 'normal' | 'extra'>>(() => {
    const init: Record<string, 'no' | 'normal' | 'extra'> = {};
    ingList.forEach(i => { init[i.id] = 'normal'; });
    (item.custom_ingredients || []).forEach(ci => { if (ci?.id) init[ci.id] = ci.action; });
    return init;
  });
  const [notes, setNotes] = useState<string>(item.notes || '');
  const [activeTab, setActiveTab] = useState<'ingredients' | 'notes'>('ingredients');
  const [openIngNames, setOpenIngNames] = useState(false);
  const lastPlusRef = useRef(0);
  const onPlus = (e: React.MouseEvent<HTMLButtonElement>) => {
    const now = performance.now();
    if (now - lastPlusRef.current < 140) return; // ignore jitter
    lastPlusRef.current = now;
    if (!isAvailable) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onAdd(item);
    announceToSR?.(t('cart.itemAdded'));
    tinyPulseCartIcon?.();
    confettiOnceForItem?.(item.id);
    requestAnimationFrame(() => flyToHeaderFromRect(r, isRTL));
  };

  // reset on item change
  useEffect(() => {
    const init: Record<string, 'no' | 'normal' | 'extra'> = {};
    ingList.forEach(i => { init[i.id] = 'normal'; });
    (item.custom_ingredients || []).forEach(ci => { if (ci?.id) init[ci.id] = ci.action; });
    setIngChoice(init);
    setNotes(item.notes || '');
    setActiveTab('ingredients');
    setOpenIngNames(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const isAvailable = item.available !== false;
  const priceFmt = useMemo(
    () => currency ?? new Intl.NumberFormat(isRTL ? 'ar-QA' : 'en-QA', { style: 'currency', currency: 'QAR' }),
    [currency, isRTL]
  );
  const displayName = isRTL ? item.name_ar || item.name_en : item.name_en;
  const displayDesc =
    isRTL
      ? (item.description_ar || item.description_en || '')
      : (item.description_en || item.description_ar || '');


  const extrasTotal = useMemo(
    () => ingList.reduce((sum, i) => sum + (ingChoice[i.id] === 'extra' ? (i.extra_price ?? 0) : 0), 0),
    [ingList, ingChoice]
  );
  const anyPaidExtra = useMemo(() => ingList.some(i => (i.extra_price ?? 0) > 0), [ingList]);

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
    track('add_with_options', { item_id: item.id, extras_total: extrasTotal, has_notes: !!notes });
    if (rect) requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
    setOpenPage(false);
  };

  // page behavior (lock + focus + ESC)
  // Lock body scroll, close on Escape, trap focus
  // ==== Focus trap + Escape + body scroll lock for the panel ====
  React.useEffect(() => {
    if (!openPage) return;

    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Close on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPage(false);
    };
    window.addEventListener('keydown', onKey);

    // Basic focus trap within [role="dialog"]
    const root = document.body;
    const queryFocusable = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button, [role="dialog"] [href], [role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select, [role="dialog"] [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    const keepFocusInDialog = (e: FocusEvent) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      if (!dialog.contains(e.target as Node)) {
        const els = queryFocusable();
        if (els.length) els[0].focus();
      }
    };
    root.addEventListener('focusin', keepFocusInDialog);

    // Set initial focus (Back button)
    firstFocusRef.current?.focus();

    const lastTrigger = lastTriggerRef.current;

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('focusin', keepFocusInDialog);
      // Restore focus to the element that opened the panel
      lastTrigger?.focus?.();
    };
  }, [openPage, setOpenPage]);

  // ==== SR live announcer (pairs with <div id="cart-live-region" ... />) ====
  function announceToSR(message: string) {
    const live = document.getElementById('cart-live-region');
    if (!live) return;
    // Clear then set (ensures screen readers announce updates)
    live.textContent = '';
    setTimeout(() => (live.textContent = message), 10);
  }

  // ==== Cart icon micro-pulse (250–300ms) ====
  // Add data-cart-icon to your header cart button:  <button data-cart-icon ...>
  function tinyPulseCartIcon() {
    if (prefersReducedMotion) return;
    const el = document.querySelector('[data-cart-icon]') as HTMLElement | null;
    if (!el || !el.animate) return;
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'ease-out' }
    );
  }

  // ==== One-time confetti per item (lightweight, GC-friendly) ====
  function confettiOnceForItem(itemId: string) {
    if (prefersReducedMotion) return;
    const set = addedOnceRef.current;
    if (set.has(itemId)) return;
    set.add(itemId);

    const root = document.body;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        position: 'fixed',
        top: '12px',
        right: '16px', // adjust if your cart is on the left in RTL
        width: '6px',
        height: '6px',
        background: 'currentColor',
        color: 'rgb(16,185,129)', // emerald-ish
        borderRadius: '9999px',
        pointerEvents: 'none',
        zIndex: '10000',
      } as CSSStyleDeclaration);
      root.appendChild(dot);

      const theta = (Math.PI * 2 * i) / count;
      const dx = Math.cos(theta) * 90;
      const dy = Math.sin(theta) * 60;

      dot.animate(
        [
          { transform: 'translate(0,0)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }
      ).onfinish = () => dot.remove();
    }
  }

  /* ---------- UI: Card (image left, content right) ---------- */
  return (
    <>
      <div
        className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-md hover:shadow-lg transition overflow-hidden"
        role="group"
      >
        {/* Compare top-right on the CARD (not the image) */}
        {isAvailable && showCompareChip && onToggleCompare && (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onToggleCompare(item.id);
              track('compare_toggle', { id: item.id, selected: !compareSelected });
            }}
            disabled={compareDisabled && !compareSelected}
            aria-pressed={compareSelected}
            className={[
              'absolute top-3 z-10 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400',
              isRTL ? 'left-3' : 'right-3',
              compareSelected
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                : compareDisabled
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 cursor-not-allowed'
                  : 'bg-white/90 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800',
            ].join(' ')}
            title={
              compareDisabled && !compareSelected
                ? t('compare.limit')
                : compareSelected
                  ? t('compare.comparing')
                  : t('compare.compare')
            }
          >
            <span className="inline-flex items-center gap-1">
              <Scale className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {t(compareSelected ? 'compare.comparing' : 'compare.compare')}
              </span>
            </span>
          </button>
        )}

        {/* Clickable row opens the page (not the qty/buttons) */}
        <div
          role="button"
          tabIndex={isAvailable ? 0 : -1}              // not focusable when unavailable
          aria-disabled={!isAvailable || undefined}    // announces state to SRs
          dir={isRTL ? 'rtl' : 'ltr'}
          className="w-full outline-none text-start"
          onClick={(e) => {
            if (!isAvailable) return;
            lastTriggerRef.current = e.currentTarget as HTMLElement;
            setOpenPage(true);
            track('item_page_open', { id: item.id });
          }}
          onKeyDown={(e) => {
            if (!isAvailable) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              lastTriggerRef.current = e.currentTarget as HTMLElement;
              setOpenPage(true);
              track('item_page_open', { id: item.id });
            }
          }}
        >
          <div className="flex items-stretch gap-4 p-4">
            {/* Image with fixed aspect + skeleton fade-in */}
            <div className="shrink-0 w-[128px] h-[128px] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-700 relative">
              <img
                src={item.image_url || FALLBACK_400}
                srcSet={[
                  `${(item.image_url || FALLBACK_400).replace('w=400', 'w=300')} 300w`,
                  `${(item.image_url || FALLBACK_400).replace('w=400', 'w=400')} 400w`,
                  `${(item.image_url || FALLBACK_400).replace('w=400', 'w=600')} 600w`,
                  `${(item.image_url || FALLBACK_400).replace('w=400', 'w=800')} 800w`,
                ].join(', ')}
                sizes="(max-width: 640px) 128px, 128px"
                alt={displayName}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-0"
                onLoad={(e) => (e.currentTarget.style.opacity = '1')}
              />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="min-w-0">
                <h3
                  dir="auto"
                  lang={isRTL ? 'ar' : 'en'}
                  style={{ unicodeBidi: 'plaintext' as any }}
                  className="text-[18px] sm:text-[20px] font-bold text-slate-900 dark:text-white truncate"
                >
                  {displayName}
                </h3>
                {/* Short “description”: first few ingredients if available */}
                {displayDesc ? (
                  <p className="mt-1 text-slate-500 dark:text-slate-400 text-[15px] leading-snug line-clamp-2">
                    {displayDesc}
                  </p>
                ) : !!(item.ingredients_details?.length) && (
                  <p className="mt-1 text-slate-500 dark:text-slate-400 text-[15px] leading-snug line-clamp-2">
                    {(item.ingredients_details || [])
                      .map(d => (isRTL ? d.ingredient.name_ar : d.ingredient.name_en) || '')
                      .filter(Boolean)
                      .slice(0, 5)
                      .join(isRTL ? '، ' : ', ')}
                  </p>
                )}

              </div>

              {/* Footer row: price left — controls right */}
              <div className={`mt-auto pt-2 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className="text-[15px] font-bold text-slate-900 dark:text-white tabular-nums">
                  {priceFmt.format(item.price ?? 0)}
                </div>

                {quantity > 0 ? (
                  <div
                    className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => { onRemove(item.id); track('remove_from_cart', { item_id: item.id }); }}
                      className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 grid place-items-center shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 transition"
                      aria-label={t('common.decrease')}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[2ch] text-center font-bold text-slate-900 dark:text-white">{quantity}</span>
                    <button
                      onClick={onPlus}
                      disabled={!isAvailable}
                      className={`w-10 h-10 rounded-full grid place-items-center shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 transition ${isAvailable
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                        }`}
                      aria-label={t('common.increase')}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={onPlus}
                      disabled={!isAvailable}
                      className={`w-10 h-10 rounded-full grid place-items-center shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 transition ${isAvailable
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-95'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                        }`}
                      aria-label={t('menu.addToCart')}
                      title={t('menu.addToCart')}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Overlay when unavailable — put this INSIDE the outer "relative" card, after the clickable row */}
        {!isAvailable && (
          <div
            className="absolute inset-0 bg-white/60 dark:bg-slate-900/50 backdrop-blur-[2px] grid place-items-center z-20"
            aria-hidden="true"
          >
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              {isRTL ? 'غير متاح مؤقتاً' : 'Temporarily unavailable'}
            </span>
          </div>
        )}
      </div>

      {/* ======= FULLSCREEN PAGE======= */}
      {openPage && createPortal(
        <div className="fixed inset-0 z-[9999]">
          {/* background (no outside click to close) */}
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="absolute inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[520px] bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-none shadow-2xl overflow-hidden animate-page-in sm:animate-panel-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-panel-title"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between z-10">
              <button
                ref={firstFocusRef}
                onClick={() => setOpenPage(false)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                aria-label={t('common.back')}
              >
                <ArrowLeft className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} />
                <span className="text-sm">{t('common.back')}</span>
              </button>
              <h4 id="item-panel-title" className="font-bold text-slate-900 dark:text-white truncate max-w-[60%]">
                {displayName}
              </h4>
              <button
                onClick={() => setOpenPage(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Hero */}
            <div className="px-4 pt-4">
              <img
                src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800'}
                alt={displayName}
                className="w-full h-48 sm:h-56 object-cover rounded-xl"
              />
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <h5 className="text-lg font-extrabold text-slate-900 dark:text-white">{displayName}</h5>
                  {item.categories && (
                    <span className="inline-flex mt-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                      {isRTL ? item.categories.name_ar : item.categories.name_en}
                    </span>
                  )}
                </div>
                <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {priceFmt.format((item.price || 0) + extrasTotal)}
                </div>
              </div>

              {displayDesc && (
                <div className={`mt-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 ${isRTL ? 'text-right' : ''}`}>

                  <p
                    dir="auto"
                    lang={isRTL ? 'ar' : 'en'}
                    style={{ unicodeBidi: 'plaintext' as any }}
                    className="mt-1 text-slate-500 dark:text-slate-400 text-[15px] leading-snug line-clamp-2"
                  >
                    {displayDesc}
                  </p>
                </div>
              )}

            </div>

            {/* Body (dvh/safe areas) */}
            <div className="px-4 py-4 max-h-[calc(100dvh-520px)] overflow-auto" ref={panelScrollRef}>
              {/* Tabs */}
              <div className={`flex ${isRTL ? 'flex-row-reverse' : ''} bg-slate-100 dark:bg-slate-700 rounded-xl p-1 w-fit`}>
                {(['ingredients', 'notes'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${activeTab === tab ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    aria-pressed={activeTab === tab}
                  >
                    {tab === 'ingredients' ? t('menu.customize') : t('common.notes')}
                  </button>
                ))}
              </div>

              {/* Content */}
              {activeTab === 'ingredients' ? (
  <div className="space-y-3">
    {/* Sticky customize header strip */}
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/90 dark:bg-slate-800/90 supports-[backdrop-filter]:backdrop-blur border-b border-slate-200/60 dark:border-slate-700/60">
      {/* Title + extras total */}
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-2`}>
        <span className={`${isRTL ? 'mr-auto' : 'ml-auto'} text-xs text-slate-500`}>
          {t('pricing.extras')}: <strong className="tabular-nums">{priceFmt.format(extrasTotal)}</strong>
        </span>
      </div>

      {/* Quick actions — horizontally scrollable if cramped */}
      <div className={`mt-2 flex flex-nowrap items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''} overflow-x-auto whitespace-nowrap`}>
        <button
          onClick={() => {
            const next: Record<string, 'no' | 'normal' | 'extra'> = {};
            ingList.forEach(i => (next[i.id] = 'normal'));
            setIngChoice(next);
            track('customize_quick_reset', { item_id: item.id });
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t('custom.reset')}
        </button>

        <button
          onClick={() => {
            const next: Record<string, 'no' | 'normal' | 'extra'> = {};
            ingList.forEach(i => (next[i.id] = 'no'));
            setIngChoice(next);
            track('customize_quick_remove_all', { item_id: item.id });
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200"
        >
          <X className="w-3.5 h-3.5" /> {t('custom.removeAll')}
        </button>

        <button
          onClick={() => {
            if (!anyPaidExtra) return;
            const next: Record<string, 'no' | 'normal' | 'extra'> = {};
            ingList.forEach(i => (next[i.id] = (i.extra_price ?? 0) > 0 ? 'extra' : 'normal'));
            setIngChoice(next);
            track('customize_quick_extra_all', { item_id: item.id });
          }}
          disabled={!anyPaidExtra}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${
            anyPaidExtra
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Star className="w-3.5 h-3.5" /> {t(anyPaidExtra ? 'custom.extraAllPaid' : 'custom.extraAll')}
        </button>
      </div>
    </div>

    {/* Ingredient list (checkbox + Extra pill per row) */}
    {ingList.map((ing) => {
      const choice = ingChoice[ing.id] || 'normal';
      const checked = choice !== 'no';
      const canExtra = (ing.extra_price ?? 0) > 0;

      const toggleCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
        const on = e.target.checked;
        setIngChoice(prev => ({ ...prev, [ing.id]: on ? 'normal' : 'no' }));
      };

      const toggleExtra = () => {
        if (!checked) return; // must be selected first
        setIngChoice(prev => ({ ...prev, [ing.id]: choice === 'extra' ? 'normal' : 'extra' }));
      };

      return (
        <div
          key={ing.id}
          className="border border-slate-200 dark:border-slate-600 rounded-xl p-3 hover:border-emerald-400/60 transition"
          role="group"
          aria-label={isRTL ? ing.name_ar : ing.name_en}
        >
          <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-3`}>
            <label className="flex items-center gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-emerald-600 focus:ring-emerald-500"
                checked={checked}
                onChange={toggleCheck}
                aria-label={t('custom.include')}
              />
              <span
                className="text-sm font-medium text-slate-800 dark:text-slate-100"
                dir="auto"
                lang={isRTL ? 'ar' : 'en'}
              >
                {(isRTL ? ing.name_ar : ing.name_en) || ''}
              </span>
            </label>

            {canExtra && (
              <button
                type="button"
                onClick={toggleExtra}
                disabled={!checked}
                className={[
                  'text-xs px-2 py-1 rounded-full border transition',
                  checked && choice === 'extra'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700'
                    : checked
                    ? 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                    : 'bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-700 dark:text-slate-500 dark:border-slate-600 cursor-not-allowed'
                ].join(' ')}
                aria-pressed={checked && choice === 'extra'}
              >
                {t('custom.extra')} + {priceFmt.format(ing.extra_price!)}
              </button>
            )}
          </div>
        </div>
      );
    })}
  </div>
) : (
  <div>
    <label className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1 block">{t('common.notes')}</label>
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      maxLength={140}
      className="w-full min-h-[120px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
      placeholder={t('common.notesPlaceholder')}
    />
    <div className="mt-1 text-xs text-slate-500">{notes.length}/140</div>
  </div>
)}


              {/* Price breakdown line */}
              <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {t('pricing.base')} {priceFmt.format(item.price ?? 0)}{'  •  '}
                {t('pricing.extras')} +{priceFmt.format(extrasTotal)}{'  =  '}
                <strong>{priceFmt.format((item.price ?? 0) + extrasTotal)}</strong>
              </div>
            </div>

            {/* Footer (CTA) */}
            <div className="sticky bottom-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {t('pricing.total')}: <strong>{priceFmt.format((item.price ?? 0) + extrasTotal)}</strong>
                </div>
                <button
                  onClick={(e) => addWithOptions((e.currentTarget as HTMLElement).getBoundingClientRect())}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-6 font-semibold shadow-lg active:scale-[.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
                >
                  {t('menu.addToOrder')}
                </button>
              </div>
              {/* aria-live region for cart feedback */}
              <div className="sr-only" aria-live="polite" aria-atomic="true" id="cart-live-region" />
            </div>
          </div>

          {/* Motion safety */}
          <style>{`
            .animate-page-in { animation: pageIn .32s cubic-bezier(.22,1,.36,1) forwards; }
            @keyframes pageIn { from { transform: translateY(100%) } to { transform: translateY(0) } }
            @media (min-width: 640px) {
              .animate-panel-in { animation: panelIn .30s cubic-bezier(.22,1,.36,1) forwards; }
              @keyframes panelIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
            }
            @media (prefers-reduced-motion: reduce) {
            }
            .seg{
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              border:1px solid var(--seg-b, #CBD5E1);border-radius:12px;
              padding:.55rem .75rem;background:#fff;color:#334155;transition:all .18s
            }
            .dark .seg{background:#1E293B;border-color:#475569;color:#E2E8F0}
            .seg:focus-within{outline:2px solid transparent; box-shadow:0 0 0 2px rgba(16,185,129,.5)}
            .seg__label{font-size:12px;font-weight:700}
            .seg__meta{font-size:10px;color:#64748B}.dark .seg__meta{color:#94A3B8}
            .seg--active{box-shadow:0 4px 12px rgba(0,0,0,.06)}
            .seg--active[data-variant="no"]{ --seg-b:#FCA5A5; background:#FEF2F2; color:#B91C1C; }
            .seg--active[data-variant="normal"]{ --seg-b:#C7D2FE; background:#EEF2FF; color:#3730A3; }
            .seg--active[data-variant="extra"]{ --seg-b:#34D399; background:#ECFDF5; color:#047857; }
            .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
          `}</style>
        </div>,
        document.body
      )}
    </>
  );

};

export default MenuItemCard;
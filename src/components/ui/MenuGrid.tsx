import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Search, SortAsc, SortDesc, Scale, AlertCircle } from 'lucide-react';
import MenuItemCard, { MenuItem } from './MenuItemCard';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  items: MenuItem[];
  quantityMap: Record<string, number>;
  onAdd: (item: MenuItem) => void;
  onRemove: (itemId: string) => void;
  compareIds?: string[];
  onToggleCompare?: (id: string) => void;

  /** Optional: error + retry for better UX */
  error?: string;
  onRetry?: () => void;
}

/* tiny analytics helper */
function track(name: string, props?: Record<string, unknown>) {
  try { (window as any).dataLayer?.push({ event: name, ...props }); } catch {}
  try { window.dispatchEvent(new CustomEvent('analytics:event', { detail: { name, props } })); } catch {}
}

type SortKey = 'name' | 'price_asc' | 'price_desc';

const MenuGrid: React.FC<Props> = ({
  items,
  quantityMap,
  onAdd,
  onRemove,
  compareIds,
  onToggleCompare,
  error,
  onRetry,
}) => {
  const { t, isRTL } = useLanguage();
  const [sort, setSort] = useState<SortKey>('name');

  const canCompare = !!onToggleCompare;
  const selectedSet = useMemo(() => new Set(compareIds ?? []), [compareIds]);
  const reachedMax = (id: string) => (compareIds?.length ?? 0) >= 2 && !selectedSet.has(id);

  // PERF: make heavy grouping/sorting responsive during typing/filtering upstream
  const deferredItems = useDeferredValue(items);

  const sorted = useMemo(() => {
    const copy = [...deferredItems];
    switch (sort) {
      case 'price_asc':
        return copy.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case 'price_desc':
        return copy.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      default:
        return copy.sort((a, b) => (a.name_en || '').toLowerCase().localeCompare((b.name_en || '').toLowerCase()));
    }
  }, [deferredItems, sort]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: MenuItem[] }>();
    sorted.forEach((it) => {
      const id = it.categories?.id || 'other';
      const label = isRTL ? it.categories?.name_ar || t('menu.other') : it.categories?.name_en || t('menu.other');
      if (!map.has(id)) map.set(id, { label, items: [] });
      map.get(id)!.items.push(it);
    });
    return Array.from(map.entries());
  }, [sorted, isRTL, t]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('.reveal-on-scroll'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [grouped]);

  // Empty or error states
  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('status.failedToLoadMenu') || 'Failed to load menu'}</h3>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={() => { track('retry_click'); onRetry(); }}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow"
          >
            {t('status.tryAgain') || 'Try again'}
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8 text-slate-400 dark:text-slate-500" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('menu.noItemsFound')}</h3>
        <p className="text-slate-600 dark:text-slate-400">{t('menu.noItemsDescription')}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-10 max-w-[1600px] mx-auto px-2 sm:px-4">
      {/* Toolbar */}
      <div className={`flex items-center justify-between gap-3 text-sm ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="text-slate-600 dark:text-slate-400">
          {t('common.total')}: <span className="font-semibold text-slate-900 dark:text-white">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-500 dark:text-slate-400">{t('common.sort') || 'Sort'}:</label>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => { const v = e.target.value as SortKey; setSort(v); track('sort_change', { sort: v }); }}
              className="input pr-8 py-2"
              aria-label={t('common.sort') || 'Sort'}
            >
              <option value="name">{t('common.name') || 'Name'}</option>
              <option value="price_asc">{t('menu.priceLowHigh') || 'Price: Low → High'}</option>
              <option value="price_desc">{t('menu.priceHighLow') || 'Price: High → Low'}</option>
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400">
              {sort === 'price_desc' ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
            </span>
          </div>
        </div>
      </div>

      {/* Sections */}
      {grouped.map(([categoryId, group], sectionIdx) => (
        <section key={categoryId} className="space-y-5">
          {/* Sticky category header */}
          <div className="sticky top-[76px] z-20 -mx-1 px-1">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm w-fit">
              <span className="text-lg">{emojiFor(group.label)}</span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{group.label}</h2>
            </div>
          </div>

          {/* Grid */}
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] gap-6 items-stretch">
            {group.items.map((item, i) => {
              const selected = selectedSet.has(item.id);
              const disabled = reachedMax(item.id);
              return (
                <div key={item.id} className="reveal-on-scroll h-full relative" style={{ transitionDelay: `${Math.min(i * 35 + sectionIdx * 50, 300)}ms` }}>
                  {/* Compare chip (optional) */}
                  {canCompare && (
                    <button
                      type="button"
                      onClick={() => { onToggleCompare?.(item.id); track('compare_toggle', { item_id: item.id, selected: !selected }); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCompare?.(item.id); track('compare_toggle', { item_id: item.id, via: 'kbd' }); }
                      }}
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={selected ? (t('menu.comparing') || 'Comparing') : (t('menu.compare') || 'Compare')}
                      title={disabled ? (t('menu.compareLimit') || 'You can compare up to 2 items') : selected ? (t('menu.comparing') || 'Comparing') : (t('menu.compare') || 'Compare')}
                      className={[
                        'absolute top-3 z-10 rounded-full border px-2 py-1 text-xs font-medium shadow-sm',
                        isRTL ? 'left-3' : 'right-3',
                        selected ? 'bg-primary text-white border-primary' : disabled ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 cursor-not-allowed' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700',
                      ].join(' ')}
                    >
                      <span className="inline-flex items-center gap-1"><Scale className="w-3.5 h-3.5" /><span className="hidden sm:inline">{selected ? (t('menu.comparing') || 'Comparing') : (t('menu.compare') || 'Compare')}</span></span>
                    </button>
                  )}

                  <div className="h-full">
                    <MenuItemCard
                      item={item}
                      quantity={quantityMap[item.id] || 0}
                      onAdd={onAdd}
                      onRemove={onRemove}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Reveal animation */}
      <style>{`
        .reveal-on-scroll { opacity: 0; transform: translateY(8px) scale(.98); transition: opacity .28s cubic-bezier(0.4,0,0.2,1), transform .28s cubic-bezier(0.4,0,0.2,1); will-change: opacity, transform; }
        .reveal-on-scroll.in { opacity: 1; transform: none; }
      `}</style>
    </div>
  );
};

const emojiFor = (label: string) => {
  const L = label.toLowerCase();
  if (/(burger|برجر)/.test(L)) return '🍔';
  if (/(pizza|بيتزا)/.test(L)) return '🍕';
  if (/(drink|juice|مشروب|عصير)/.test(L)) return '🥤';
  if (/(dessert|sweet|حلويات|كيك|حلى)/.test(L)) return '🍰';
  if (/(salad|healthy|veget|سلطة)/.test(L)) return '🥗';
  if (/(grill|bbq|مشوي|مشويات)/.test(L)) return '🍖';
  return '🍽️';
};

export default React.memo(MenuGrid);
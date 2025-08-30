import React, { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { Search, AlertCircle } from "lucide-react";
import MenuItemCard, { MenuItem } from "./MenuItemCard";
import { useLanguage } from "../../contexts/LanguageContext";

interface Props {
  items: MenuItem[];
  quantityMap: Record<string, number>;
  onAdd: (item: MenuItem) => void;
  onRemove: (itemId: string) => void;

  /** Compare (optional) */
  compareIds?: string[];
  onToggleCompare?: (id: string) => void;

  /** Optional: error + retry */
  error?: string;
  onRetry?: () => void;
}

/* tiny analytics helper */
function track(name: string, props?: Record<string, unknown>) {
  try {
    (window as any).dataLayer?.push({ event: name, ...props });
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent("analytics:event", { detail: { name, props } })
    );
  } catch {}
}

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

  const canCompare = Boolean(onToggleCompare);
  const selectedSet = useMemo(() => new Set(compareIds ?? []), [compareIds]);
  const reachedMax = (id: string) =>
    (compareIds?.length ?? 0) >= 2 && !selectedSet.has(id);

  // keep UI responsive while parent filters/searches
  const deferredItems = useDeferredValue(items);

  // Group by category (preserve incoming order)
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: MenuItem[] }>();
    const fallbackOther = isRTL ? "أخرى" : "Other";

    deferredItems.forEach((it) => {
      const id = it.categories?.id ?? it.category_id ?? "other";
      const label =
        (isRTL ? it.categories?.name_ar : it.categories?.name_en) ??
        t("menu.other") ??
        fallbackOther;

      if (!map.has(id)) map.set(id, { label, items: [] });
      map.get(id)!.items.push(it);
    });

    return Array.from(map.entries());
  }, [deferredItems, isRTL, t]);

  // Active section highlighting
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const els = Array.from(
      root.querySelectorAll<HTMLElement>(".reveal-on-scroll")
    );

    // NEW: show the first few immediately so we never render a blank screen
    els
      .slice(0, Math.min(8, els.length))
      .forEach((el) => el.classList.add("in"));

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      // Looser threshold so initial viewport triggers consistently
      { root: null, rootMargin: "0px 0px -15% 0px", threshold: 0 }
    );

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
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          {t("status.failedToLoadMenu")}
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={() => {
              track("retry_click");
              onRetry();
            }}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow"
          >
            {t("status.tryAgain")}
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
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          {t("menu.noItemsFound")}
        </h3>
        <p className="text-slate-600 dark:text-slate-400">
          {t("menu.noItemsDescription")}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="space-y-4 max-w-[1600px] mx-auto px-2 sm:px-4 mb-16"
    >
      {/* Toolbar (count only) */}
      <div
        className={`flex items-center ${
          isRTL ? "justify-start" : "justify-start"
        } gap-3 text-sm`}
      >
        <div className="text-slate-600 dark:text-slate-400">
          {t("common.total")}:{" "}
          <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
            {items.length}
          </span>
        </div>
      </div>

      {/* Sections */}
      {grouped.map(([categoryId, group], sectionIdx) => (
        <section
          key={categoryId}
          data-section-id={categoryId}
          ref={(el) => {
            if (el) sectionsRef.current.set(categoryId, el);
          }}
          className="space-y-2"
        >
          {/* Sticky category header (local) */}
          <div className="sticky top-[50px] z-20 -mx-1 px-1">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm w-fit">
              <span className="text-lg">{emojiFor(group.label)}</span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {group.label}{" "}
                <span className="text-slate-400">· {group.items.length}</span>
              </h2>
            </div>
          </div>

          {/* Grid */}
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] gap-6 items-stretch">
            {group.items.map((item, i) => {
              const selected = selectedSet.has(item.id);
              const disabled = reachedMax(item.id);

              return (
                <div
                  key={item.id}
                  className="reveal-on-scroll h-full relative will-change-[opacity,transform]"
                  style={{
                    transitionDelay: `${Math.min(
                      i * 35 + sectionIdx * 50,
                      300
                    )}ms`,
                    // big paint-skip for offscreen cards
                    contentVisibility: "auto" as any,
                    containIntrinsicSize: "400px 320px" as any,
                  }}
                >
                  <div className="h-full">
                    {canCompare ? (
                      <MenuItemCard
                        item={item}
                        quantity={quantityMap[item.id] || 0}
                        onAdd={onAdd}
                        onRemove={onRemove}
                        onToggleCompare={onToggleCompare}
                        compareSelected={selected}
                        compareDisabled={disabled}
                        showCompareChip
                      />
                    ) : (
                      <MenuItemCard
                        item={item}
                        quantity={quantityMap[item.id] || 0}
                        onAdd={onAdd}
                        onRemove={onRemove}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Reveal animation */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .reveal-on-scroll { opacity: 0; transform: translateY(8px) scale(.98); transition: opacity .28s cubic-bezier(0.4,0,0.2,1), transform .28s cubic-bezier(0.4,0,0.2,1); }
        .reveal-on-scroll.in { opacity: 1; transform: none; }
      `}</style>
    </div>
  );
};

const emojiFor = (label?: string) => {
  const L = (label ?? "").toString().toLowerCase();
  if (/(burger|برجر)/.test(L)) return "🍔";
  if (/(pizza|بيتزا)/.test(L)) return "🍕";
  if (/(drink|juice|مشروب|عصير)/.test(L)) return "🥤";
  if (/(dessert|sweet|حلويات|كيك|حلى)/.test(L)) return "🍰";
  if (/(salad|healthy|veget|سلطة)/.test(L)) return "🥗";
  if (/(grill|bbq|مشوي|مشويات)/.test(L)) return "🍖";
  return "🍽️";
};

export default React.memo(MenuGrid);

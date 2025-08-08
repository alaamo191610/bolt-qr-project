import React, { useMemo, useState } from 'react';
import { Plus, Minus, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Ingredient { id: string; name_en: string; name_ar: string; }

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
}

interface Props {
  item: MenuItem;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
}

/* ----------------- helpers (fly-to-header) ----------------- */
function onAnimationFinish(a: Animation): Promise<void> {
  const finished = (a as any).finished as Promise<Animation> | undefined;
  if (finished?.then) return finished.then(() => undefined).catch(() => undefined);
  return new Promise<void>((resolve) => {
    const handler = (_ev: AnimationPlaybackEvent) => {
      a.removeEventListener('finish', handler as EventListener);
      resolve();
    };
    a.addEventListener('finish', handler as EventListener, { once: true });
  });
}

async function ensureHeaderAnchor(isRTL: boolean, timeout = 700): Promise<{ el: HTMLElement; isTemp: boolean }> {
  const ID = 'header-cart-anchor';
  let el = document.getElementById(ID) as HTMLElement | null;
  if (el) return { el, isTemp: false };

  const found = await new Promise<HTMLElement | null>((resolve) => {
    const first = document.getElementById(ID) as HTMLElement | null;
    if (first) return resolve(first);
    const obs = new MutationObserver(() => {
      const target = document.getElementById(ID) as HTMLElement | null;
      if (target) { obs.disconnect(); resolve(target); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(document.getElementById(ID) as HTMLElement | null); }, timeout);
  });
  if (found) return { el: found, isTemp: false };

  const temp = document.createElement('div');
  temp.id = ID;
  temp.setAttribute('data-cart-anchor', 'header-temp');
  temp.style.position = 'fixed';
  temp.style.top = '16px';
  if (isRTL) temp.style.left = '16px'; else temp.style.right = '16px';
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
  const { el: anchor, isTemp } = await ensureHeaderAnchor(isRTL, 700);
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

/* ----------------- UI helpers ----------------- */
const money = (v: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);

type HasFn = (re: RegExp) => boolean;
type BadgeKey = 'spicy' | 'garlicky' | 'cheesy' | 'fresh' | 'vegFriendly';

interface BadgeRule {
  key: BadgeKey;
  emoji: string;
  test: (has: HasFn) => boolean;
}

const BADGE_RULES: BadgeRule[] = [
  { key: 'spicy',       emoji: '🌶', test: (has: HasFn) => has(/spicy|chili|harissa|حار|شطة/i) },
  { key: 'garlicky',    emoji: '🧄', test: (has: HasFn) => has(/garlic|ثوم/i) },
  { key: 'cheesy',      emoji: '🧀', test: (has: HasFn) => has(/cheese|جبن|كريم/i) },
  { key: 'fresh',       emoji: '🍋', test: (has: HasFn) => has(/lemon|حمض|ليمون|mint|نعناع/i) },
  { key: 'vegFriendly', emoji: '🥦', test: (has: HasFn) => !has(/chicken|beef|lamb|fish|shrimp|دجاج|لحم|سمك|روبيان/i) },
];

function tasteBadgesFrom(
  labels: string[],
  t: (key: string) => string
): { label: string; emoji: string }[] {
  const L = labels.map(s => (s || '').toLowerCase());
  const has: HasFn = (re) => L.some(x => re.test(x));

  return BADGE_RULES
    .filter(rule => rule.test(has))
    .map(rule => ({ label: t(`badges.${rule.key}`), emoji: rule.emoji }))
    .slice(0, 3);
}


type TFn = (key: string) => string;
type PairingKey =
  | 'garlicSauce'
  | 'salad'
  | 'cola'
  | 'fries'
  | 'drink'
  | 'extraCheese'
  | 'sideSalad'
  | 'bread'
  | 'juice';

interface PairItem { key: PairingKey; emoji: string }
interface PairRule { test: RegExp; items: PairItem[] }

const PAIR_RULES: PairRule[] = [
  {
    // Shawarma / grill
    test: /shawarma|kebab|grill|مشوي|كباب/i,
    items: [
      { key: 'garlicSauce', emoji: '🧄' },
      { key: 'salad',       emoji: '🥗' },
      { key: 'cola',        emoji: '🥤' },
    ],
  },
  {
    // Burger / sandwich
    test: /burger|ساندويتش|sandwich/i,
    items: [
      { key: 'fries', emoji: '🍟' },
      { key: 'drink', emoji: '🥤' },
    ],
  },
  {
    // Pasta
    test: /pasta|spaghetti|bolognese|باستا/i,
    items: [
      { key: 'extraCheese', emoji: '🧀' },
      { key: 'sideSalad',   emoji: '🥗' },
    ],
  },
  {
    // Salads
    test: /salad|سلطة/i,
    items: [
      { key: 'bread', emoji: '🥖' },
      { key: 'juice', emoji: '🥤' },
    ],
  },
];

const DEFAULT_PAIR: PairItem[] = [
  { key: 'salad', emoji: '🥗' },
  { key: 'drink', emoji: '🥤' },
];

// Returns an array of strings like "🧄 Garlic sauce" using translations
export function pairingFor(name: string, t: TFn): string[] {
  const n = (name || '').toLowerCase();
  const rule = PAIR_RULES.find(r => r.test.test(n));
  const items = (rule?.items || DEFAULT_PAIR);
  return items.map(it => `${it.emoji} ${t(`pairings.${it.key}`)}`);
}


/* ----------------- component ----------------- */

const MenuItemCard: React.FC<Props> = ({ item, quantity, onAdd, onRemove }) => {
  const { t, isRTL } = useLanguage();
  const [open, setOpen] = useState(false);

  const ingredients = item.ingredients_details ?? [];
  const ingLabels = useMemo(
    () => ingredients.map(({ ingredient }) => (isRTL ? ingredient.name_ar : ingredient.name_en)).filter(Boolean),
    [ingredients, isRTL]
  );
  const hasIngredients = ingLabels.length > 0;
  const taste = useMemo(() => tasteBadgesFrom(ingLabels, t), [ingLabels, t]);
  const pairings = useMemo(
    () => pairingFor((isRTL ? item.name_ar : item.name_en) || item.name_en, t),
    [item.name_ar, item.name_en, isRTL, t]
  );  

  const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget as HTMLElement;
    const startRect = btn.getBoundingClientRect();
    onAdd(item);
    requestAnimationFrame(() => {
      flyToHeaderFromRect(startRect, isRTL).catch(() => {});
    });
  };

  return (
    <div className="group relative h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex md:flex-col h-full">
        {/* Image */}
        <div className="relative">
          <img
            src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400'}
            alt={item.name_en}
            className="w-24 h-24 sm:w-44 sm:h-44 md:w-full md:h-48 object-cover flex-shrink-0"
          />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="steam-line" />
              <span className="steam-line delay-150" />
              <span className="steam-line delay-300" />
            </div>
          </div>
          <div className="absolute top-3 left-3 -rotate-6">
            <span className="inline-flex items-center rounded-md bg-amber-400 px-2 py-1 text-xs font-extrabold text-slate-900 shadow-md ring-1 ring-amber-500/30 price-pop">
              {money(item.price)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          {/* Title */}
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">
            {isRTL ? item.name_ar || item.name_en : item.name_en}
          </h3>

          {/* Ingredients toggle + taste badges */}
          {hasIngredients && (
            <div className={`mb-2 ${isRTL ? 'text-right' : ''}`}>
              <button
                onClick={() => setOpen(v => !v)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                aria-expanded={open}
              >
                <Info className="w-3.5 h-3.5" />
                {open ? t('common.ingredientsHide') : t('common.ingredients')}
                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {!open && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {taste.map(b => (
                    <span key={b.label} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-full">
                      <span>{b.emoji}</span> {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Collapsible ingredients */}
          {hasIngredients && (
            <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ${open ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ingLabels.map((lbl, idx) => (
                  <span key={`${lbl}-${idx}`} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                    {lbl}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional metadata */}
          {item.categories && (
            <span className="mt-1 inline-flex w-fit text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              {isRTL ? item.categories.name_ar : item.categories.name_en}
            </span>
          )}

          {/* Pairings */}
          <div className="mt-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{t('common.goesWellWith')}</div>
            <div className="flex flex-wrap gap-1.5">
              {pairings.map(p => (
                <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* FOOTER — pinned to bottom */}
          <div className="mt-auto pt-4">
            {quantity > 0 ? (
              <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="w-10 h-10 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-full flex items-center justify-center transition-transform duration-150 active:scale-95"
                    aria-label={t('common.decrease')}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-base min-w-[2rem] text-center text-slate-900 dark:text-white">
                    {quantity}
                  </span>
                  <button
                    onClick={(e) => {
                      const btn = e.currentTarget as HTMLElement;
                      const rect = btn.getBoundingClientRect();
                      onAdd(item);
                      requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
                    }}
                    className="w-10 h-10 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-full flex items-center justify-center transition-transform duration-150 shadow-lg active:scale-95"
                    aria-label={t('common.increase')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  const btn = e.currentTarget as HTMLElement;
                  const rect = btn.getBoundingClientRect();
                  onAdd(item);
                  requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl transition-transform duration-150 font-medium text-sm shadow-lg active:scale-95"
              >
                {t('menu.addToCart')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* local styles */}
      <style>{`
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .price-pop { transform: translateZ(0); }
        .group:hover .price-pop { animation: pricePop .5s cubic-bezier(.22,1,.36,1); }
        @keyframes pricePop {
          0% { transform: rotate(-6deg) scale(1); }
          30% { transform: rotate(-3deg) scale(1.08); }
          100% { transform: rotate(-6deg) scale(1); }
        }
        .steam-line { width: 6px; height: 14px; background: linear-gradient(to top, rgba(16,185,129,0.15), rgba(16,185,129,0.05));
          border-radius: 999px; filter: blur(1px); animation: steam 1.8s ease-in-out infinite; }
        @keyframes steam { 0% { transform: translateY(6px) scaleX(1); opacity: 0; } 25% { opacity: .8; }
          100% { transform: translateY(-12px) scaleX(0.6); opacity: 0; } }
      `}</style>
    </div>
  );
};

export default MenuItemCard;
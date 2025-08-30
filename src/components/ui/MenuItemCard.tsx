"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Minus, ArrowLeft, X, RefreshCw, Star } from "lucide-react"; // ⬅️ removed Scale
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import toast from "react-hot-toast";
import CompareChip from "./CompareChip";
import CustomerItemModal from "../../components/CustomerItemModal";
import { useAdminMonetary } from "../../hooks/useAdminMonetary";
import { formatPrice } from "../../pricing/usePrice";

// Local copy of the customizer payload type
type CartLine = {
  menuId: string;
  quantity: number;
  notes?: string;
  ingredients?: {
    ingredientId: string;
    action: "remove" | "extra";
    qty?: number;
  }[];
  options?: { optionId: string; qty?: number }[];
  comboChildren?: { childMenuId: string; notes?: string }[];
};

/* ---------- Types ---------- */
interface Ingredient {
  id: string;
  name_en: string;
  name_ar: string;
  extra_price?: number;
}
interface Modifier {
  id: string;
  name_en: string;
  name_ar: string;
  price?: number;
}

export interface MenuItem {
  id: string;
  name_en: string;
  name_ar?: string;
  description_en?: string;
  description_ar?: string;
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
  custom_ingredients?: { id: string; action: "normal" | "no" | "extra" }[];
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

/* ---------- analytics helper ---------- */
function track(name: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    (window as any).dataLayer?.push({ event: name, ...props });
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent("analytics:event", { detail: { name, props } })
    );
  } catch {}
}

/* ---------- small motion helpers ---------- */
function onAnimationFinish(a: Animation) {
  const f = (a as any).finished as Promise<Animation> | undefined;
  return (
    f?.then(() => {}) ??
    new Promise<void>((r) =>
      a.addEventListener("finish", () => r(), { once: true })
    )
  );
}

async function ensureCartAnchor(
  isRTL: boolean,
  timeout = 700
): Promise<{ el: HTMLElement; isTemp: boolean }> {
  const CANDIDATES = ["header-cart-anchor", "floating-cart-anchor"];
  for (const id of CANDIDATES) {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) return { el, isTemp: false };
  }
  const found = await new Promise<HTMLElement | null>((resolve) => {
    const obs = new MutationObserver(() => {
      for (const id of CANDIDATES) {
        const hit = document.getElementById(id) as HTMLElement | null;
        if (hit) {
          obs.disconnect();
          resolve(hit);
          return;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(null);
    }, timeout);
  });
  if (found) return { el: found, isTemp: false };

  const temp = document.createElement("div");
  temp.id = "header-cart-anchor";
  temp.setAttribute("data-cart-anchor", "header-temp");
  temp.style.position = "fixed";
  temp.style.top = "16px";
  isRTL ? (temp.style.left = "16px") : (temp.style.right = "16px");
  temp.style.width = "1px";
  temp.style.height = "1px";
  temp.style.pointerEvents = "none";
  temp.style.opacity = "0";
  temp.style.zIndex = "1";
  document.body.appendChild(temp);
  return { el: temp, isTemp: true };
}

async function flyToHeaderFromRect(
  startRect:
    | DOMRect
    | { left: number; top: number; width: number; height: number },
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
  const EMOJIS = ["🍔", "🍕", "🍟", "🌯", "🥙", "🥗", "🍤", "🍣", "🍰", "🥤"];
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const bubble = document.createElement("div");
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const inView =
    endRect.top >= 0 &&
    endRect.left >= 0 &&
    endRect.left <= viewport.w &&
    endRect.top <= viewport.h;
  if (!inView) return;

  bubble.textContent = emoji;
  bubble.style.position = "fixed";
  bubble.style.left = `${startX}px`;
  bubble.style.top = `${startY}px`;
  bubble.style.zIndex = "9999";
  bubble.style.fontSize = "26px";
  bubble.style.pointerEvents = "none";
  bubble.style.willChange = "transform, opacity";
  document.body.appendChild(bubble);
  const anim = bubble.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      {
        transform: `translate(${midX - startX}px, ${
          midY - startY
        }px) scale(0.9)`,
        opacity: 0.9,
        offset: 0.55,
      },
      {
        transform: `translate(${endX - startX}px, ${
          endY - startY
        }px) scale(0.66)`,
        opacity: 0.2,
        offset: 1,
      },
    ],
    { duration: 1100, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
  );
  await onAnimationFinish(anim);
  bubble.remove();
  if (isTemp) anchor.remove();
}

/* ---------- NEW: “VS” compare icon (two squares + VS badge) ---------- */
const CompareIconVS: React.FC<{ className?: string; active?: boolean }> = ({
  className,
  active,
}) => (
  <span
    className={[
      "relative inline-flex items-center justify-center",
      className || "",
    ].join(" ")}
  >
    <span className="flex gap-0.5">
      <span
        className={`w-3.5 h-3.5 rounded-[3px] ${
          active ? "bg-white/90" : "bg-slate-500/80 dark:bg-slate-400/80"
        }`}
      />
      <span
        className={`w-3.5 h-3.5 rounded-[3px] ${
          active ? "bg-white/70" : "bg-slate-400/70 dark:bg-slate-500/70"
        }`}
      />
    </span>
    <span
      aria-hidden="true"
      className={`absolute -bottom-1 -right-2 flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-extrabold ${
        active
          ? "bg-white text-emerald-600"
          : "bg-emerald-600 text-white dark:bg-emerald-500"
      }`}
      style={{ lineHeight: 1 }}
    >
      VS
    </span>
  </span>
);

/* ---------- component ---------- */
const MenuItemCard: React.FC<Props> = ({
  item,
  quantity,
  onAdd,
  onRemove,
  onToggleCompare,
  compareSelected = false,
  compareDisabled = false,
  showCompareChip = false,
}) => {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Safe i18n → always a string (prevents TS2322 on aria/title)
  const tt = (key: string, fallback: string, values?: any): string => {
    const v = t?.(key as any, values) as unknown;
    return typeof v === "string" ? v : v == null ? fallback : String(v);
  };

  // Full-screen “page”
  const [openPage, setOpenPage] = useState(false);
  const [pendingQty, setPendingQty] = useState<number>(quantity);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);
  const panelScrollRef = React.useRef<HTMLDivElement | null>(null);
  const addedOnceRef = React.useRef<Set<string>>(new Set());
  const FALLBACK_400 =
    "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400";

  // reduced-motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Ingredients & notes
  const ingList: Ingredient[] = useMemo(
    () =>
      (item.ingredients_details ?? [])
        .map((d) => d?.ingredient)
        .filter((x): x is Ingredient => !!(x && x.id))
        .map((i) => ({
          ...i,
          extra_price:
            typeof i.extra_price === "number"
              ? i.extra_price
              : Number.parseFloat(String(i.extra_price ?? "0")) || 0,
        })),
    [item.ingredients_details]
  );

  const [ingChoice, setIngChoice] = useState<
    Record<string, "no" | "normal" | "extra">
  >(() => {
    const init: Record<string, "no" | "normal" | "extra"> = {};
    ingList.forEach((i) => {
      init[i.id] = "normal";
    });
    (item.custom_ingredients || []).forEach((ci) => {
      if (ci?.id) init[ci.id] = ci.action;
    });
    return init;
  });
  const [notes, setNotes] = useState<string>(item.notes || "");
  const [activeTab, setActiveTab] = useState<"ingredients" | "notes">(
    "ingredients"
  );
  const lastPlusRef = useRef(0);

  const onPlus = (e: React.MouseEvent<HTMLButtonElement>) => {
    const now = performance.now();
    if (now - lastPlusRef.current < 140) return;
    lastPlusRef.current = now;
    if (!isAvailable) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onAdd(item);
    announceToSR?.(tt("cart.itemAdded", "Added to cart"));
    tinyPulseCartIcon?.();
    confettiOnceForItem?.(item.id);
    requestAnimationFrame(() => flyToHeaderFromRect(r, isRTL));
  };
  useEffect(() => {
    setPendingQty(quantity);
  }, [quantity]);

  const incPending = () => setPendingQty((q) => q + 1);
  const decPending = () => setPendingQty((q) => Math.max(0, q - 1));
  const commitPending = async (rect: DOMRect) => {
    if (quantity === 0 && pendingQty === 0) {
      // first-time add (adds 1 with options)
      await Promise.resolve(addWithOptions(rect));
      return;
    }

    const delta = pendingQty - quantity;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) onAdd(item); // add extra units
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) onRemove?.(item.id); // remove units
    }

    // optional animation + close (if you use these)
    requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
    setOpenPage(false);
  };
  // reset on item change
  useEffect(() => {
    const init: Record<string, "no" | "normal" | "extra"> = {};
    ingList.forEach((i) => {
      init[i.id] = "normal";
    });
    (item.custom_ingredients || []).forEach((ci) => {
      if (ci?.id) init[ci.id] = ci.action;
    });
    setIngChoice(init);
    setNotes(item.notes || "");
    setActiveTab("ingredients");
    // removed unused openIngNames to avoid TS6133
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const isAvailable = item.available !== false;
  const { prefs, loading: moneyLoading } = useAdminMonetary(); // if your hook requires adminId, pass it here
  const fmt = (v: number) => formatPrice(v, prefs);

  const displayName = isRTL ? item.name_ar || item.name_en : item.name_en;
  const displayDesc = isRTL
    ? item.description_ar || item.description_en || ""
    : item.description_en || item.description_ar || "";

  const extrasTotal = useMemo(
    () =>
      ingList.reduce(
        (sum, i) =>
          sum + (ingChoice[i.id] === "extra" ? i.extra_price ?? 0 : 0),
        0
      ),
    [ingList, ingChoice]
  );
  const anyPaidExtra = useMemo(
    () => ingList.some((i) => (i.extra_price ?? 0) > 0),
    [ingList]
  );
  const unit = (item.price ?? 0) + extrasTotal; // per one item with extras
  const qtyForTotal = pendingQty > 0 ? pendingQty : quantity > 0 ? quantity : 1;

  const addWithOptions = (rect?: DOMRect) => {
    const custom_ingredients = ingList.map((i) => ({
      id: i.id,
      action: ingChoice[i.id],
    }));
    const selected_modifiers = ingList.flatMap((i) => {
      const a = ingChoice[i.id];
      if (a === "no") return [`ing:${i.id}:no`];
      if (a === "extra") return [`ing:${i.id}:extra`];
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
    track("add_with_options", {
      item_id: item.id,
      extras_total: extrasTotal,
      has_notes: !!notes,
    });
    if (rect) requestAnimationFrame(() => flyToHeaderFromRect(rect, isRTL));
    setOpenPage(false);
  };

  // Focus trap + Escape + body scroll lock
  React.useEffect(() => {
    if (!openPage) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPage(false);
    };
    window.addEventListener("keydown", onKey);

    const root = document.body;
    const queryFocusable = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button, [role="dialog"] [href], [role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select, [role="dialog"] [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
      );

    const keepFocusInDialog = (e: FocusEvent) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      if (!dialog.contains(e.target as Node)) {
        const els = queryFocusable();
        if (els.length) els[0].focus();
      }
    };
    root.addEventListener("focusin", keepFocusInDialog);

    firstFocusRef.current?.focus();
    const lastTrigger = lastTriggerRef.current;

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("focusin", keepFocusInDialog);
      lastTrigger?.focus?.();
    };
  }, [openPage, setOpenPage]);

  // SR live announcer
  function announceToSR(message: string) {
    const live = document.getElementById("cart-live-region");
    if (!live) return;
    live.textContent = "";
    setTimeout(() => (live.textContent = message), 10);
  }

  // Cart icon pulse
  function tinyPulseCartIcon() {
    if (prefersReducedMotion) return;
    const el = document.querySelector("[data-cart-icon]") as HTMLElement | null;
    if (!el || !el.animate) return;
    el.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.1)" },
        { transform: "scale(1)" },
      ],
      { duration: 280, easing: "ease-out" }
    );
  }
  function handleAddFromModal(line: CartLine) {
    // Convert customizer picks -> your MenuItem shape for the cart
    const custom_ingredients = (line.ingredients || []).map((p) => ({
      id: p.ingredientId,
      action: p.action === "remove" ? "no" : "extra", // your cart expects "no"|"extra"
    }));

    // Optional: include options/combos in the cart item (for display later)
    const selected_options = (line.options || []).map(
      (o) => `opt:${o.optionId}${o.qty && o.qty > 1 ? `x${o.qty}` : ""}`
    );

    // Build the payload your current onAdd() understands
    const cartItem: MenuItem = {
      ...item,
      // keep base item fields
      notes: line.notes || "",
      custom_ingredients,
      price_delta: 0, // Cart UI can stay simple; pricing is recomputed server-side at checkout
      selected_modifiers: selected_options, // optional display chip support
    } as MenuItem;

    // Attach the full payload for checkout (Edge Function)
    (cartItem as any).edgePayload = line;

    onAdd(cartItem);
    setOpenMenuId(null);
  }

  // One-time confetti
  function confettiOnceForItem(itemId: string) {
    if (prefersReducedMotion) return;
    const set = addedOnceRef.current;
    if (set.has(itemId)) return;
    set.add(itemId);

    const root = document.body;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("span");
      Object.assign(dot.style, {
        position: "fixed",
        top: "12px",
        right: "16px",
        width: "6px",
        height: "6px",
        background: "currentColor",
        color: "rgb(16,185,129)",
        borderRadius: "9999px",
        pointerEvents: "none",
        zIndex: "10000",
      } as CSSStyleDeclaration);
      root.appendChild(dot);

      const theta = (Math.PI * 2 * i) / count;
      const dx = Math.cos(theta) * 90;
      const dy = Math.sin(theta) * 60;

      dot.animate(
        [
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
        ],
        { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
      ).onfinish = () => dot.remove();
    }
  }

  /* ---------- UI: Card ---------- */
  return (
    <>
      <div
        className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-md hover:shadow-lg transition overflow-hidden"
        role="group"
      >
        {/* Compare chip (top corner) */}
        {isAvailable && showCompareChip && onToggleCompare && (
          <CompareChip
            selected={!!compareSelected}
            disabled={!!(!compareSelected && compareDisabled)}
            onToggle={() => {
              if (!compareSelected && compareDisabled) {
                // Optional: toast using your i18n
                toast.error(
                  t("menu.compareLimit") ?? "You can compare up to 2 items",
                  {
                    position: "bottom-center",
                    duration: 2000,
                  }
                );
                return;
              }
              onToggleCompare(item.id);
            }}
            isRTL={isRTL}
          />
        )}

        {/* Clickable row opens the page */}
        <div
          role="button"
          tabIndex={isAvailable ? 0 : -1}
          aria-disabled={!isAvailable || undefined}
          dir={isRTL ? "rtl" : "ltr"}
          className="w-full outline-none text-start"
          onClick={(e) => {
            if (!isAvailable) return;
            lastTriggerRef.current = e.currentTarget as HTMLElement;
            setOpenMenuId(item.id);
            track("item_modal_open", { id: item.id });
          }}
          onKeyDown={(e) => {
            if (!isAvailable) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              lastTriggerRef.current = e.currentTarget as HTMLElement;
              setOpenMenuId(item.id);
              track("item_modal_open", { id: item.id });
            }
          }}
        >
          <div className="flex items-stretch gap-4 p-4">
            {/* Image */}
            <div className="shrink-0 w-[128px] h-[128px] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-700 relative">
              <img
                src={item.image_url || FALLBACK_400}
                srcSet={[
                  `${(item.image_url || FALLBACK_400).replace(
                    "w=400",
                    "w=300"
                  )} 300w`,
                  `${(item.image_url || FALLBACK_400).replace(
                    "w=400",
                    "w=400"
                  )} 400w`,
                  `${(item.image_url || FALLBACK_400).replace(
                    "w=400",
                    "w=600"
                  )} 600w`,
                  `${(item.image_url || FALLBACK_400).replace(
                    "w=400",
                    "w=800"
                  )} 800w`,
                ].join(", ")}
                sizes="(max-width: 640px) 128px, 128px"
                alt={displayName}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-0"
                onLoad={(e) => (e.currentTarget.style.opacity = "1")}
              />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="min-w-0">
                <h3
                  dir="auto"
                  lang={isRTL ? "ar" : "en"}
                  style={{ unicodeBidi: "plaintext" as any }}
                  className="text-[18px] sm:text-[20px] font-bold text-slate-900 dark:text-white truncate"
                >
                  {displayName}
                </h3>

                {displayDesc ? (
                  <p className="mt-1 text-slate-500 dark:text-slate-400 text-[12px] leading-snug line-clamp-2">
                    {displayDesc}
                  </p>
                ) : (
                  !!item.ingredients_details?.length && (
                    <p className="mt-1 text-slate-500 dark:text-slate-400 text-[15px] leading-snug line-clamp-2">
                      {(item.ingredients_details || [])
                        .map(
                          (d) =>
                            (isRTL
                              ? d.ingredient.name_ar
                              : d.ingredient.name_en) || ""
                        )
                        .filter(Boolean)
                        .slice(0, 5)
                        .join(isRTL ? "، " : ", ")}
                    </p>
                  )
                )}
              </div>

              {/* Footer row item card */}
              <div
                className={`mt-auto pt-2 flex items-center justify-between ${
                  isRTL ? "flex-row-reverse" : ""
                }`}
              >
                <div className="text-[12px] font-bold text-slate-900 dark:text-white tabular-nums">
                  <span className={moneyLoading ? "opacity-0" : ""}>
                    {fmt(item.price ?? 0)}
                  </span>
                </div>

                {quantity > 0 ? (
                  <div
                    className={`flex items-center ${
                      isRTL ? "flex-row-reverse" : ""
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        onRemove(item.id);
                        track("remove_from_cart", { item_id: item.id });
                      }}
                      className="w-8 h-8 rounded-full bg-slate-200 text-white dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 dark:text-slate-100 grid place-items-center shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 transition"
                      style={{
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                      }}
                      aria-label={tt("common.decrease", "Decrease")}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[2ch] text-center font-bold text-slate-900 dark:text-white">
                      {quantity}
                    </span>
                    <button
                      onClick={onPlus}
                      disabled={!isAvailable}
                      className={`w-8 h-8 rounded-full grid place-items-center shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 transition ${
                        isAvailable
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                      }}
                      aria-label={tt("common.increase", "Increase")}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={onPlus}
                      disabled={!isAvailable}
                      className={`w-10 h-10 rounded-full grid place-items-center shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 transition ${
                        isAvailable
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-95"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                      }}
                      aria-label={tt("menu.addToCart", "Add to cart")}
                      title={tt("menu.addToCart", "Add to cart")}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <CustomerItemModal
          menuId={item.id}
          isOpen={openMenuId === item.id}
          onClose={() => setOpenMenuId(null)}
          onAddToCart={handleAddFromModal}
        />
        {/* Unavailable overlay */}
        {!isAvailable && (
          <div
            className="absolute inset-0 bg-white/60 dark:bg-slate-900/50 backdrop-blur-[2px] grid place-items-center z-20"
            aria-hidden="true"
          >
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              {isRTL ? "غير متاح مؤقتاً" : "Temporarily unavailable"}
            </span>
          </div>
        )}
      </div>

      {/* ======= FULLSCREEN PAGE ======= */}
      {openPage &&
        createPortal(
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/40" />
            <div
              className={[
                "absolute inset-x-0 bottom-0 h-[86dvh]",
                "sm:inset-auto sm:top-4 sm:bottom-4 sm:right-4 sm:left-auto sm:w-[520px] sm:h-[92dvh]",
                "bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl",
                "overflow-hidden grid grid-rows-[auto_auto_auto_1fr_auto]",
              ].join(" ")}
              role="dialog"
              aria-modal="true"
              aria-labelledby="item-panel-title"
            >
              {/* Header */}
              <div className="row-start-1 row-end-2 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between z-[90]">
                <button
                  ref={firstFocusRef}
                  onClick={() => setOpenPage(false)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                  aria-label={tt("common.back", "Back")}
                >
                  <ArrowLeft
                    className={`w-5 h-5 ${isRTL ? "rotate-180" : ""}`}
                  />
                  <span className="text-sm">{tt("common.back", "Back")}</span>
                </button>
                <h4
                  id="item-panel-title"
                  className="font-bold text-slate-900 dark:text-white truncate max-w-[60%]"
                >
                  {displayName}
                </h4>
                <button
                  onClick={() => setOpenPage(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                  aria-label={tt("common.close", "Close")}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Hero */}
              <div className="row-start-2 row-end-3 px-4 pt-4">
                <img
                  src={
                    item.image_url ||
                    "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800"
                  }
                  alt={displayName}
                  className="w-full h-48 sm:h-56 object-cover rounded-xl"
                />
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <h5 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {displayName}
                    </h5>
                    {item.categories && (
                      <span className="inline-flex mt-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                        {isRTL
                          ? item.categories.name_ar
                          : item.categories.name_en}
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    <span className={moneyLoading ? "opacity-0" : ""}>
                      {fmt((item.price || 0) + extrasTotal)}
                    </span>
                  </div>
                </div>

                {displayDesc && (
                  <div
                    className={`mt-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 ${
                      isRTL ? "text-right" : ""
                    }`}
                  >
                    <p
                      dir="auto"
                      lang={isRTL ? "ar" : "en"}
                      style={{ unicodeBidi: "plaintext" as any }}
                      className="mt-1 text-slate-500 dark:text-slate-400 text-[15px] leading-snug line-clamp-2"
                    >
                      {displayDesc}
                    </p>
                  </div>
                )}
              </div>

              {/* Tabs + quick actions */}
              <div className="row-start-3 row-end-4 border-t border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800 z-[85]">
                <div
                  className={`px-4 pt-3 pb-2 flex ${
                    isRTL ? "flex-row-reverse" : ""
                  } items-center gap-2`}
                >
                  {(["ingredients", "notes"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                        activeTab === tab
                          ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                      aria-pressed={activeTab === tab}
                    >
                      {tab === "ingredients"
                        ? tt("menu.customize", "Customize")
                        : tt("common.notes", "Notes")}
                    </button>
                  ))}
                  {activeTab === "ingredients" && (
                    <span
                      className={`${
                        isRTL ? "mr-auto" : "ml-auto"
                      } text-xs text-slate-500`}
                    >
                      {tt("pricing.extras", "Extras")}:{" "}
                      <strong className="tabular-nums">
                        <span className={moneyLoading ? "opacity-0" : ""}>
                          {fmt(extrasTotal)}
                        </span>
                      </strong>
                    </span>
                  )}
                </div>

                {activeTab === "ingredients" && (
                  <div
                    className={`px-4 pb-3 flex flex-nowrap items-center gap-2 ${
                      isRTL ? "flex-row-reverse" : ""
                    } overflow-x-auto whitespace-nowrap`}
                  >
                    <button
                      onClick={() => {
                        const next: Record<string, "no" | "normal" | "extra"> =
                          {};
                        ingList.forEach((i) => (next[i.id] = "normal"));
                        setIngChoice(next);
                        track("customize_quick_reset", { item_id: item.id });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />{" "}
                      {tt("custom.reset", "Reset")}
                    </button>

                    <button
                      onClick={() => {
                        const next: Record<string, "no" | "normal" | "extra"> =
                          {};
                        ingList.forEach((i) => (next[i.id] = "no"));
                        setIngChoice(next);
                        track("customize_quick_remove_all", {
                          item_id: item.id,
                        });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                    >
                      <X className="w-3.5 h-3.5" />{" "}
                      {tt("custom.removeAll", "Remove all")}
                    </button>

                    <button
                      onClick={() => {
                        if (!anyPaidExtra) return;
                        const next: Record<string, "no" | "normal" | "extra"> =
                          {};
                        ingList.forEach(
                          (i) =>
                            (next[i.id] =
                              (i.extra_price ?? 0) > 0 ? "extra" : "normal")
                        );
                        setIngChoice(next);
                        track("customize_quick_extra_all", {
                          item_id: item.id,
                        });
                      }}
                      disabled={!anyPaidExtra}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${
                        anyPaidExtra
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      <Star className="w-3.5 h-3.5" />{" "}
                      {tt(
                        anyPaidExtra
                          ? "custom.extraAllPaid"
                          : "custom.extraAll",
                        anyPaidExtra ? "Extra all (paid)" : "Extra all"
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Scroller */}
              <div
                ref={panelScrollRef}
                className="row-start-4 row-end-5 overflow-y-auto min-h-0 px-4 py-4"
              >
                {activeTab === "ingredients" ? (
                  ingList.length ? (
                    <div className="space-y-3">
                      {ingList.map((ing) => {
                        const choice = ingChoice[ing.id] || "normal";
                        const checked = choice !== "no";
                        const canExtra = (ing.extra_price ?? 0) > 0;

                        const toggleCheck = (
                          e: React.ChangeEvent<HTMLInputElement>
                        ) => {
                          const on = e.target.checked;
                          setIngChoice((prev) => ({
                            ...prev,
                            [ing.id]: on ? "normal" : "no",
                          }));
                        };
                        const toggleExtra = () => {
                          if (!checked) return;
                          setIngChoice((prev) => ({
                            ...prev,
                            [ing.id]: choice === "extra" ? "normal" : "extra",
                          }));
                        };

                        return (
                          <div
                            key={ing.id}
                            className="border border-slate-200 dark:border-slate-600 rounded-xl p-3 hover:border-emerald-400/60 transition bg-white dark:bg-slate-800"
                            role="group"
                            aria-label={isRTL ? ing.name_ar : ing.name_en}
                          >
                            <div
                              className={`flex items-center ${
                                isRTL ? "flex-row-reverse" : ""
                              } gap-3`}
                            >
                              <label className="flex items-center gap-2 cursor-pointer flex-1">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-emerald-600 focus:ring-emerald-500"
                                  checked={checked}
                                  onChange={toggleCheck}
                                  aria-label={tt("custom.include", "Include")}
                                />
                                <span
                                  className="text-sm font-medium text-slate-800 dark:text-slate-100"
                                  dir="auto"
                                  lang={isRTL ? "ar" : "en"}
                                >
                                  {(isRTL ? ing.name_ar : ing.name_en) || ""}
                                </span>
                              </label>

                              {canExtra && (
                                <button
                                  type="button"
                                  onClick={toggleExtra}
                                  disabled={!checked}
                                  className={[
                                    "text-xs px-2 py-1 rounded-full border transition",
                                    checked && choice === "extra"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700"
                                      : checked
                                      ? "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600"
                                      : "bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-700 dark:text-slate-500 dark:border-slate-600 cursor-not-allowed",
                                  ].join(" ")}
                                  aria-pressed={checked && choice === "extra"}
                                >
                                  {tt("custom.extra", "Extra")} +{" "}
                                  {fmt(ing.extra_price || 0)}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-slate-500 text-sm">
                      {tt(
                        "menu.noCustomizations",
                        "No customizations for this item."
                      )}
                    </div>
                  )
                ) : (
                  <div>
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1 block">
                      {tt("common.notes", "Notes")}
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={140}
                      className="w-full min-h-[120px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder={tt(
                        "common.notesPlaceholder",
                        "Add any special requests (140 chars)"
                      )}
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      {notes.length}/140
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="row-start-5 row-end-6 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  {/* total */}
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {tt("pricing.total", "Total")}:{" "}
                    <strong>
                      <span className={moneyLoading ? "opacity-0" : ""}>
                        {fmt(unit * qtyForTotal)}
                      </span>
                    </strong>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* show +/- when pending > 0 (local-controlled) */}
                    {pendingQty > 0 && (
                      <div className="flex items-center gap-2">
                        {/* − (local only) */}
                        <button
                          type="button"
                          onClick={decPending}
                          aria-label={tt("common.decrease", "Decrease")}
                          className="inline-grid place-items-center w-10 h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 active:scale-95 text-white"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M5 12h14" />
                          </svg>
                        </button>

                        {/* pending qty display (not cart yet) */}
                        <output
                          className="min-w-[2ch] text-center font-semibold text-slate-900 dark:text-white"
                          aria-live="polite"
                        >
                          {pendingQty}
                        </output>

                        {/* + (local only) */}
                        <button
                          type="button"
                          onClick={incPending}
                          aria-label={tt("common.increase", "Increase")}
                          className="inline-grid place-items-center w-10 h-10 rounded-xl btn-primary text-white active:scale-95"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Add to order / Confirm */}
                    <button
                      type="button"
                      onClick={async (e) => {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        // If no quantity yet, treat click as "add 1 with options"
                        if (quantity === 0) {
                          try {
                            await Promise.resolve(addWithOptions(rect));
                          } catch {}
                          return;
                        }
                        // Otherwise, confirm the pending +/- changes
                        try {
                          await commitPending(rect);
                        } catch {}
                      }}
                      className="rounded-xl btn-primary text-white py-3 px-6 font-semibold shadow-lg active:scale-[.99] transition
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
                      disabled={moneyLoading || item.available === false}
                      aria-disabled={moneyLoading || item.available === false}
                    >
                      {quantity === 0
                        ? tt("menu.addToOrder", "Add to order")
                        : tt("menu.confirmChanges", "Confirm")}
                    </button>
                  </div>
                </div>

                <div
                  className="sr-only"
                  aria-live="polite"
                  aria-atomic="true"
                  id="cart-live-region"
                />
              </div>
            </div>

            <style>{`
            .animate-page-in { animation: pageIn .32s cubic-bezier(.22,1,.36,1) forwards; }
            @keyframes pageIn { from { transform: translateY(100%) } to { transform: translateY(0) } }
            @media (min-width: 640px) {
              .animate-panel-in { animation: panelIn .30s cubic-bezier(.22,1,.36,1) forwards; }
              @keyframes panelIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
            }
            .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
          `}</style>
          </div>,
          document.body
        )}
    </>
  );
};

export default MenuItemCard;

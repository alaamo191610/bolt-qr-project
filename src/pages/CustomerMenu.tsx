"use client";

import React, { useLayoutEffect, useRef, useState, useEffect, useMemo, useCallback, useDeferredValue } from "react";
import { Search, MapPin, Check } from "lucide-react";
import { BsBagHeart, BsQrCode } from "react-icons/bs";
import { useLanguage } from "../contexts/LanguageContext";
import { menuService } from "../services/menuService";
import { orderService } from "../services/orderService";
import { tableService } from "../services/tableService";
import { trackMenuEvents } from "../lib/firebase";
import LanguageToggle from "../components/LanguageToggle";
import CartDrawer from "../components/ui/CartDrawer";
import CategoryFilter from "../components/ui/CategoryFilter";
import MenuGrid from "../components/ui/MenuGrid";
import OrderConfirmation from "../components/ui/OrderConfirmation";
import CompareSheet from "../components/ui/CompareSheet"; // 🆕 compare modal
import { HeaderCartPopover } from '../components/ui/Popover';
import toast from "react-hot-toast";
import { useAdminMonetary } from '../hooks/useAdminMonetary';
import { formatPrice } from '../pricing/usePrice';
import { computeTotals } from '../pricing/totals';
import type { Promotion } from '../pricing/types';

interface Ingredient {
  id: string;
  name_en: string;
  name_ar: string;
}
interface Category {
  id: string;
  name_en: string;
  name_ar: string;
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
}
interface CartItem extends MenuItem {
  quantity: number;
}

type OverlayPos = { top: number; left?: number; right?: number };

// scoped cart key per table
const cartKeyFor = (table: string) => `qr-cart-v1:${table || "unknown"}`;

const CustomerMenu: React.FC = () => {
  const { t, isRTL, language } = useLanguage();
  const { billing, prefs, loading: moneyLoading } = useAdminMonetary(); // adminId optional
  const [promoRow, setPromoRow] = useState<Promotion | null>(null); // optional
  const [lastCart, setLastCart] = useState<CartItem[]>([]);

  // data
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState("");

  // ui
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [showCart, setShowCart] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [showCartOverlay, setShowCartOverlay] = useState(false);
  const [overlayPos, setOverlayPos] = useState<OverlayPos>({
    top: 0,
    right: 16,
  });

  // state
  const [loading, setLoading] = useState(true);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [error, setError] = useState<{
    code: string;
    params?: Record<string, any>;
  } | null>(null);

  // 🆕 compare
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  useLayoutEffect(() => {
    // grab once on mount
    setAnchorEl(document.getElementById('header-cart-anchor'));
  }, []);
  const handleClearCart = () => {
    const previous = cart;            // snapshot for undo
    setCart([]);
  
    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3`}
      >
        <span className="text-sm text-slate-700 dark:text-slate-200">
          {isRTL ? 'تم تفريغ السلة' : 'Cart cleared'}
        </span>
        <button
          onClick={() => {
            setCart(previous);
            toast.dismiss(t.id);
          }}
          className="ml-auto px-2.5 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {isRTL ? 'تراجع' : 'Undo'}
        </button>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="px-2.5 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {isRTL ? 'إغلاق' : 'Close'}
        </button>
      </div>
    ), { duration: 5000 });
  };

  useLayoutEffect(() => {
    // if opening and anchor not found yet, try again
    if (showCartOverlay && !anchorEl) {
      setAnchorEl(document.getElementById('header-cart-anchor'));
    }
  }, [showCartOverlay, anchorEl]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);

      if (prev.length >= 2) {
        toast.error(t('compare.limit') || 'You can compare up to 2 items', {
          position: "bottom-center",
          duration: 2500,
          style: {
            background: "#ef4444", // Tailwind red-500
            color: "#fff",
            fontWeight: 600,
            borderRadius: "8px",
            padding: "8px 16px",
          },
        });
        return prev;
      }

      return [...prev, id];
    });
  }, []);

  const clearCompare = useCallback(() => setCompareIds([]), []);

  const comparedItems = useMemo(
    () => menuItems.filter((m) => compareIds.includes(m.id)),
    [menuItems, compareIds]
  );
  const isDesktop = () =>
    typeof window !== "undefined" && window.innerWidth >= 640; // tailwind sm

  // currency (default QAR; change as needed)
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(isRTL ? "ar-QA" : "en-QA", {
        style: "currency",
        currency: "QAR",
      }),
    [isRTL]
  );

  // bootstrap
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const table = (urlParams.get('table') || 'T01').trim().toUpperCase();
    setTableNumber(table);
    loadMenuItems(table);

    if (table) trackMenuEvents.menuViewed(table, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
  // load selected category per table
  useEffect(() => {
    if (!tableNumber) return;
    const saved = sessionStorage.getItem(`qr-selected-category:${tableNumber}`);
    setSelectedCategory(saved || "All");
  }, [tableNumber]);

  useEffect(() => {
    if (!tableNumber) return;
    sessionStorage.setItem(
      `qr-selected-category:${tableNumber}`,
      selectedCategory
    );
  }, [selectedCategory, tableNumber]);

  // cart persistence (per table)
  useEffect(() => {
    if (!tableNumber) return;
    try {
      const saved = sessionStorage.getItem(cartKeyFor(tableNumber));
      if (saved) setCart(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, [tableNumber]);

  useEffect(() => {
    if (!tableNumber) return;
    try {
      sessionStorage.setItem(cartKeyFor(tableNumber), JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, tableNumber]);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    // Briefly highlight the bar when the user reaches 2 selections
    if (compareIds.length === 2) {
      const el = document.getElementById("compare-bar");
      if (el && !prefersReducedMotion && el.animate) {
        el.animate(
          [
            { boxShadow: "0 0 0 0 rgba(16,185,129,0.0)" },
            { boxShadow: "0 0 0 6px rgba(16,185,129,0.35)" },
            { boxShadow: "0 0 0 0 rgba(16,185,129,0.0)" },
          ],
          { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    }
  }, [compareIds.length, prefersReducedMotion]);
  // fetch menu
  const loadMenuItems = async (tableCode: string) => {
    if (!tableCode) {
      setError({ code: "status.tableNotFound" });
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const table = await tableService.getTableByCode(tableCode);
      if (!table) {
        setError({
          code: "status.tableNotFound",
          params: { table: tableCode },
        });
        return;
      }

      const items = await menuService.getMenuItems(table.admin_id);
      if (!items || items.length === 0) {
        setError({ code: "status.noMenuItems" });
        return;
      }

      const transformed = items.map((item: any) => {
        const normalizedPrice =
          typeof item.price === "number"
            ? item.price
            : parseFloat(item.price ?? "");
        return {
          id: item.id,
          name_en: item.name_en,
          name_ar: item.name_ar,
          description_en: item.description_en ?? null,
          description_ar: item.description_ar ?? null,
          price: Number.isFinite(normalizedPrice) ? normalizedPrice : 0,
          image_url: item.image_url || "/images/placeholder.png",
          available: item.available,
          created_at: item.created_at,
          category_id: item.category_id,
          ingredients_details: item.ingredients_details || [],
          categories: item.categories || undefined,
        } as MenuItem;
      });

      setMenuItems(transformed);

      const categoryMap = new Map<string, Category>();
      items.forEach((it: any) => {
        if (it.categories && !categoryMap.has(it.categories.id)) {
          categoryMap.set(it.categories.id, it.categories);
        }
      });
      setCategories(Array.from(categoryMap.values()));
    } catch (err) {
      setError({ code: "status.failedToLoadMenu" });
      console.error("Error loading menu:", err);
    } finally {
      setLoading(false);
    }
  };

  // derived: filtered items
  const filteredItems = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const filtered = menuItems.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" || item.category_id === selectedCategory;

      const baseName = isRTL ? item.name_ar || item.name_en : item.name_en;
      const desc = isRTL
        ? item.description_ar || item.description_en || ""
        : item.description_en || item.description_ar || "";

      const nameMatch = term
        ? (baseName || "").toLowerCase().includes(term)
        : true;
      const descMatch = term
        ? (desc || "").toLowerCase().includes(term)
        : false;

      return matchesCategory && (nameMatch || descMatch);
    });

    return filtered;
  }, [menuItems, selectedCategory, deferredSearch, isRTL]);

  // NEW: debounce search tracking
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return; // only track when user typed something

    const id = window.setTimeout(() => {
      trackMenuEvents.menuSearched(term.toLowerCase(), filteredItems.length);
    }, 350); // debounce ~0.35s

    return () => clearTimeout(id);
  }, [searchTerm, filteredItems.length]);
  // ---- variant helpers (same id + same options = same line) ----
  const variantKey = (m: Partial<MenuItem>) =>
    JSON.stringify({
      id: m.id,
      price_delta: Number((m as any).price_delta || 0),
      custom_ingredients: ((m as any).custom_ingredients || [])
        .map((x: any) => ({ id: x.id, action: x.action }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
    });

  const isSameVariant = (a: Partial<MenuItem>, b: Partial<MenuItem>) =>
    variantKey(a) === variantKey(b);

  // ---- money helpers (unit incl. extras) ----
  type CartLine = CartItem & { price_delta?: number; custom_ingredients?: { id: string; action: 'normal' | 'no' | 'extra' }[] };
  const unit = (it: CartLine) => (it.price || 0) + (it.price_delta || 0);
  const line = (it: CartLine) => unit(it) * (it.quantity || 0);

  // derived: quantity map / totals
  const quantityMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of cart as CartLine[]) {
      m[it.id] = (m[it.id] || 0) + (it.quantity || 0);
    }
    return m;
  }, [cart]);


  const totalItems = useMemo(
    () => cart.reduce((n, it) => n + it.quantity, 0),
    [cart]
  );

  const totalPrice = useMemo(
    () => (cart as CartLine[]).reduce((sum, it) => sum + line(it), 0),
    [cart]
  );

  const formattedSubtotal = useMemo(
    () => (moneyLoading ? currency.format(totalPrice) : formatPrice(totalPrice, prefs)),
    [moneyLoading, totalPrice, prefs]
  );

  const breakdown = useMemo(() => {
    if (moneyLoading || !billing) {
      const delivery = billing?.deliveryFee ?? 0;
      return { discount: 0, vat: 0, service: 0, delivery, total: totalPrice + delivery };
    }
    const { discount, vat, service, total } = computeTotals(totalPrice, billing, promoRow);
    return { discount, vat, service, delivery: billing.deliveryFee, total };
  }, [totalPrice, billing, promoRow, moneyLoading]);

  // cart ops
  const addToCart = useCallback((incoming: MenuItem) => {
    setCart(prev => {
      const copy = [...prev] as CartLine[];
      const i = copy.findIndex(li => isSameVariant(li, incoming));
      if (i >= 0) {
        copy[i] = { ...copy[i], quantity: (copy[i].quantity || 0) + 1 };
      } else {
        copy.push({ ...(incoming as any), quantity: 1 });
      }
      // analytics: include extras if present
      const priceWithExtras = (incoming.price || 0) + ((incoming as any).price_delta || 0);
      trackMenuEvents.itemAddedToCart(incoming.id, incoming.name_en, priceWithExtras, 1);
      return copy;
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => {
      const copy = [...prev] as CartLine[];
      const idx = [...copy].reverse().findIndex(li => li.id === itemId);
      if (idx === -1) return prev;
      const realIdx = copy.length - 1 - idx;
      const target = copy[realIdx];
      const q = Math.max(1, Number(target.quantity || 1));
      if (q > 1) {
        copy[realIdx] = { ...target, quantity: q - 1 };
      } else {
        copy.splice(realIdx, 1);
      }
      trackMenuEvents.itemRemovedFromCart(itemId, target.name_en, unit(target), 1);
      return copy;
    });
  }, []);

  const placeOrder = async () => {
    setIsOrdering(true);

    // Track order started
    trackMenuEvents.orderStarted(tableNumber, totalItems, totalPrice);

    try {
      const orderItems = cart.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_order: item.price,
      }));
      await orderService.createOrder({
        table_code: tableNumber,
        items: orderItems,
      });

      // Track successful order
      trackMenuEvents.orderCompleted(tableNumber, cart, totalPrice);

      setOrderPlaced(true);
      setShowCart(false);
      setCart([]);
      sessionStorage.removeItem(cartKeyFor(tableNumber)); // clear persisted cart
    } catch (err) {
      setError({ code: "status.failedToPlaceOrder" });
      console.error("Error placing order:", err);
    } finally {
      setIsOrdering(false);
    }
  };

  // auto-hide order confirmation
  useEffect(() => {
    if (!orderPlaced) return;
    const id = window.setTimeout(() => setOrderPlaced(false), 5000);
    return () => clearTimeout(id);
  }, [orderPlaced]);

  // overlay positioning
  const getAnchorPosition = (offsetY = 8): OverlayPos | null => {
    const anchor = document.getElementById("header-cart-anchor");
    if (!anchor) return null;
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + offsetY + window.scrollY;
    if (isRTL) return { top, left: r.left + window.scrollX };
    return { top, right: window.innerWidth - r.right + window.scrollX };
  };
  const nudgeIfDisabled = (btn: HTMLButtonElement | null) => {
    if (prefersReducedMotion || !btn?.animate) return;
    btn.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 180, easing: "ease-out" }
    );
  };
  useEffect(() => {
    if (!showCartOverlay) return;
    const update = () => {
      setOverlayPos(
        getAnchorPosition(10) || {
          top: 80,
          ...(isRTL ? { left: 16 } : { right: 16 }),
        }
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [showCartOverlay, isRTL]);

  // close overlay on outside click / Esc / resize to mobile
  useEffect(() => {
    if (!showCartOverlay) return;

    const onDown = (e: MouseEvent) => {
      const anchor = document.getElementById("header-cart-anchor");
      const pop = document.getElementById("header-cart-popover");
      if (anchor?.contains(e.target as Node) || pop?.contains(e.target as Node))
        return;
      setShowCartOverlay(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCartOverlay(false);
    };
    const onResize = () => {
      if (!isDesktop()) setShowCartOverlay(false);
    };

    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [showCartOverlay]);

  const onHeaderCartClick = () => {
    if (!totalItems) return;

    // Track cart view
    trackMenuEvents.cartViewed(totalItems, totalPrice);

    if (isDesktop()) setShowCartOverlay((v) => !v);
    else setShowCart(true);
  };

  // views
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 shadow-soft">
            <BsQrCode className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            {t("common.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 text-center max-w-md w-full animate-scale-in">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t("status.errorLoadingMenu")}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t(error.code, error.params)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition"
          >
            {t("status.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  if (orderPlaced) return <OrderConfirmation tableNumber={tableNumber} />;

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 ${isRTL ? "rtl" : "ltr"
        }`}
    >
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* left: title & meta */}
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t("restaurant.name")}
              </h1>
              <div
                className={`flex items-center text-sm text-slate-600 dark:text-slate-400 gap-4 ${isRTL ? "flex-row-reverse" : ""
                  }`}
              >
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {t("orders.table")} {tableNumber}
                  </span>
                </div>
              </div>
            </div>
            {/* right: language toggle + cart — cart last, even in Arabic */}
            <div className="flex items-center gap-3" dir="ltr">
              <LanguageToggle variant="button" />
              <button
                id="header-cart-anchor"
                data-cart-anchor="header"
                data-cart-icon
                onClick={onHeaderCartClick}
                className="relative px-3 py-2 rounded-lg btn-primary text-white flex items-center gap-2 hover:opacity-90 transition"
                aria-haspopup="dialog"
                aria-expanded={showCartOverlay}
                aria-controls="header-cart-popover"
              >
                <BsBagHeart className="w-5 h-5" />
                <span className="font-medium hidden sm:inline">
                  {/* {currency.format(totalPrice)} */}
                  {formattedSubtotal}
                </span>
                {totalItems > 0 && (
                  <span
                    className={`absolute -top-2 ${isRTL ? "-left-2" : "-right-2"
                      } bg-amber-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold animate-pulse`}
                  >
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search + Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft border border-slate-200 dark:border-slate-700 p-4 mb-6 animate-slide-up">
          <div className="flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
              <Search
                className={`absolute ${isRTL ? "right-3" : "left-3"
                  } top-3 w-5 h-5 text-slate-400 dark:text-slate-500`}
              />
              <input
                type="text"
                placeholder={t("menu.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full ${isRTL ? "pr-10 pl-4" : "pl-10 pr-4"
                  } py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
              />
            </div>

            {/* Category Filter (sticky under header while scrolling) */}
            <div className="sticky top-[76px] z-30 -mx-4 px-4 py-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xs border-b border-slate-200/60 dark:border-slate-700/60">
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={(categoryId) => {
                  setSelectedCategory(categoryId);
                  // Track category filtering
                  const category = categories.find((c) => c.id === categoryId);
                  if (category) {
                    trackMenuEvents.categoryFiltered(
                      categoryId,
                      isRTL ? category.name_ar : category.name_en
                    );
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <MenuGrid
          items={filteredItems}
          quantityMap={quantityMap}
          onAdd={addToCart}
          onRemove={removeFromCart}
          compareIds={compareIds} // 🆕 pass compare selection
          onToggleCompare={(id) => {
            const item = filteredItems.find((i) => i.id === id);
            const isSelected = compareIds.includes(id);
            if (item) {
              trackMenuEvents.itemCompareToggled(id, item.name_en, !isSelected);
            }
            toggleCompare(id);
          }}
        />

        {filteredItems.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft border border-slate-200 dark:border-slate-700 p-12 text-center animate-fade-in">
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
        )}
      </div>

      {/* Header cart popover (desktop only) */}
      <HeaderCartPopover
        open={showCartOverlay && isDesktop()}
        anchorEl={triggerRef.current}
        isRTL={isRTL}
      >
        {/* just the panel content here – no fixed wrapper, no overlayPos */}
        <div className="relative">
          <span
            className={[
              "pointer-events-none",
              "absolute -top-2 block w-3 h-3 rotate-45",
              "bg-white dark:bg-slate-800",
              "border border-slate-200 dark:border-slate-700",
              isRTL ? "left-6 border-l-0 border-b-0" : "right-6 border-r-0 border-b-0",
            ].join(" ")}
            aria-hidden
          />
          {/* Panel */}
          <div
            role="region"
            aria-label={t('cart.preview') || 'Cart preview'}
            className="animate-scale-in w-full sm:w-[340px] max-w-[calc(100vw-24px)] bg-white dark:bg-slate-800
                 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t('menu.yourOrder')}
                </span>
                <span
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  aria-live="polite"
                >
                  <span className="font-semibold">{totalItems}</span>
                  <span>{t('orders.items') || 'items'}</span>
                </span>
              </div>
            </div>

            {/* Lines */}
            <div
              className="max-h-[min(50vh,18rem)] overflow-y-auto divide-y divide-slate-100/80 dark:divide-slate-700/80 [scrollbar-width:thin]"
              style={{
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)',
                maskImage:
                  'linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)',
              }}
            >
              {cart.length === 0 ? (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400">
                  {t('menu.cartEmpty')}
                </div>
              ) : (
                cart.map((it) => (
                  <div key={it.id} className="p-3 flex items-center gap-3">
                    <img
                      src={it.image_url || '/images/placeholder.png'}
                      alt={(isRTL ? it.name_ar || it.name_en : it.name_en) || 'item'}
                      className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900 dark:text-white leading-5 line-clamp-2">
                          {isRTL ? it.name_ar || it.name_en : it.name_en}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatPrice(line(it as CartLine), prefs)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          {it.quantity} × {formatPrice(unit(it as CartLine), prefs)}
                        </span>
                        {!!(it as any).selected_modifiers?.length && <span className="mx-2">•</span>}
                        {!!(it as any).selected_modifiers?.length && (
                          <span className="truncate inline-block max-w-[55%] align-bottom">
                            {(it as any).selected_modifiers.join(', ')}
                          </span>
                        )}
                        {!!(it as any).notes && (
                          <>
                            <span className="mx-2">•</span>
                            <span className="truncate inline-block max-w-[55%] align-bottom italic">
                              {(it as any).notes}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* optional quick controls preserved... */}
                    {/* ... */}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600 dark:text-slate-300">{t('common.total')}</span>
                <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400" aria-live="polite">
                  {formattedSubtotal}
                </span>
              </div>
              <button
                onClick={() => { setShowCartOverlay(false); setShowCart(true); }}
                disabled={cart.length === 0}
                className="w-full rounded-lg bg-primary text-white py-2 font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition"
              >
                {t('cart.viewOrder')}
              </button>
            </div>
          </div>
        </div>
      </HeaderCartPopover>



      {/* Cart Drawer */}
      {showCart && (
        <CartDrawer
          cart={cart}
          tableNumber={tableNumber}
          isRTL={isRTL}
          isOrdering={isOrdering}
          onClose={() => setShowCart(false)}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onPlaceOrder={placeOrder}
          onClearCart={handleClearCart}
          // onEditItem={(item) => openEditModal(item)}
        />
      )}

      {/* 🆕 Sticky compare bar (above order bar) */}
      {compareIds.length > 0 && !showCart && (
        <div className="fixed inset-x-0 z-20 bottom-16 sm:bottom-20 pointer-events-none">
          <div className="max-w-4xl mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-transparent">
            <div
              id="compare-bar"
              role="region"
              aria-live="polite"
              aria-label={t("menu.compareTray") || "Compare tray"}
              className={[
                "relative pointer-events-auto flex items-center justify-between gap-3",
                "rounded-2xl px-3 sm:px-4 py-3",
                "backdrop-blur-lg shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
                "text-slate-900 dark:text-white",
                // base glass neutral
                compareIds.length === 2
                  ? "bg-emerald-500/15 border border-emerald-400/40 ring-1 ring-emerald-400/20"
                  : "bg-white/10 border border-white/30 ring-1 ring-white/20"
              ].join(" ")}
              style={{
                ["--tw-glass-sheen" as any]:
                  "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05))",
              }}
            >
              {/* sheen overlay */}
              <span className="pointer-events-none absolute inset-0 rounded-2xl mix-blend-overlay opacity-80 [background:var(--tw-glass-sheen)]" />
              {/* top edge highlight */}
              <span className="pointer-events-none absolute inset-x-0 -top-px h-px rounded-t-2xl bg-white/60 dark:bg-white/20" />

              {/* Left: selected thumbnails + count */}
              <div className="relative flex items-center gap-3 min-w-0">
                <div className="flex -space-x-2 rtl:space-x-reverse">
                  {comparedItems.slice(0, 2).map((m) => (
                    <img
                      key={m.id}
                      src={m.image_url || "/images/placeholder.png"}
                      alt={(isRTL ? m.name_ar || m.name_en : m.name_en) || ""}
                      className="w-8 h-8 rounded-full ring-2 ring-white/30 object-cover"
                      loading="lazy"
                    />
                  ))}
                  {/* ghost slots */}
                  {Array.from({ length: Math.max(0, 2 - comparedItems.length) }).map(
                    (_, i) => (
                      <div
                        key={`ghost-${i}`}
                        className="w-8 h-8 rounded-full ring-2 ring-white/30 bg-white/10 grid place-items-center text-xs"
                        aria-hidden="true"
                      >
                        +
                      </div>
                    )
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-medium truncate">
                    {t("menu.compareCount", { n: String(compareIds.length) })}{" "}
                    <span className="opacity-90">{compareIds.length}/2</span>
                  </div>

                  {/* progress bar */}
                  <div className="mt-1 h-1.5 w-24 sm:w-32 bg-white/15 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{
                        width: `${(Math.min(compareIds.length, 2) / 2) * 100}%`,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>

              {/* Right: actions */}
              <div
                className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""
                  }`}
              >
                <button
                  onClick={() => {
                    clearCompare();
                  }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
                >
                  {t("common.clear") || "Clear"}
                </button>

                <button
                  disabled={compareIds.length < 2}
                  onClick={(e) => {
                    if (compareIds.length < 2) {
                      toast.error(
                        t("compare.needTwo") || "Select two items to compare",
                        { position: "bottom-center", duration: 2000 }
                      );
                      nudgeIfDisabled(e.currentTarget);
                      return;
                    }
                    trackMenuEvents.compareSheetViewed(compareIds);
                    setShowCompare(true);
                  }}
                  aria-disabled={compareIds.length < 2 || undefined}
                  className={[
                    "px-3 py-2 rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-400",
                    compareIds.length < 2
                      ? "bg-white/20 cursor-not-allowed"
                      : "bg-emerald-500 text-white hover:opacity-90",
                  ].join(" ")}
                >
                  {t("menu.compare") || "Compare"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Sticky bottom order bar */}
      {!showCart && totalItems > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 animate-slide-up">
          <div className="max-w-4xl mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => {
                trackMenuEvents.cartViewed(totalItems, totalPrice);
                setShowCart(true);
              }}
              className={[
                // layout
                "group relative w-full flex items-center justify-between gap-3",
                // shape
                "rounded-[22px] px-4 py-3",
                // glass base
                "backdrop-blur bg-white/4 dark:bg-white/4",
                // crisp glass edge & subtle depth
                "border border-white/30 dark:border-white/10 ring-1 ring-white/20",
                "shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
                // interaction
                "transition duration-300 hover:bg-white/15 active:scale-[0.995]",
                // text color adapts to theme
                "text-slate-900 dark:text-white"
              ].join(" ")}
              style={{
                // gentle diagonal sheen blended over whatever sits behind
                // (no hard colors—lets the page bleed through)
                // You can tweak the from/to stops for more/less shine.
                // Works across light/dark thanks to mix-blend overlay.
                // @ts-ignore – Tailwind arbitrary props ok
                ["--tw-glass-sheen" as any]: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05))",
              }}
            >
              {/* sheen overlay */}
              <span className="pointer-events-none absolute inset-0 rounded-[22px] mix-blend-overlay opacity-80 [background:var(--tw-glass-sheen)]" />

              {/* top edge highlight */}
              <span className="pointer-events-none absolute inset-x-0 -top-px h-px rounded-t-[22px] bg-white/60 dark:bg-white/20" />

              <div className="relative flex items-center gap-2">
                <BsBagHeart className="w-5 h-5 opacity-90" />
                <span className="font-semibold">{t('cart.viewOrder')}</span>
              </div>

              <div className={`relative flex items-center gap-2 text-sm ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 border border-white/30 dark:border-white/10 bg-white/10 dark:bg-white/10 backdrop-blur-sm">
                  <Check className="w-4 h-4" />
                  {totalItems}
                </span>
                <span className="font-bold">{formattedSubtotal}</span>
              </div>

              {/* subtle focus ring for a11y */}
              <span className="absolute inset-0 rounded-[22px] ring-2 ring-transparent group-focus-visible:ring-white/40" />
            </button>
          </div>
        </div>
      )}

      {/* 🆕 Compare sheet */}
      {showCompare && (
        <CompareSheet
          items={comparedItems}
          isRTL={isRTL}
          currency={currency}
          onClose={() => setShowCompare(false)}
          onAddToCart={addToCart}
          onRemoveFromCart={removeFromCart}
          quantityMap={quantityMap}
        />
      )}
    </div>
  );
};

export default CustomerMenu;

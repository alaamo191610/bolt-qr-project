'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, Search, MapPin, Phone, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { menuService } from '../services/menuService';
import { orderService } from '../services/orderService';
import { tableService } from '../services/tableService';
import LanguageToggle from '../components/LanguageToggle';
import CartDrawer from '../components/ui/CartDrawer';
import CategoryFilter from '../components/ui/CategoryFilter';
import MenuGrid from '../components/ui/MenuGrid';
import OrderConfirmation from '../components/ui/OrderConfirmation';
import FloatingCartButton from '../components/ui/FloatingCartButton';
import CompareSheet from '../components/ui/CompareSheet'; // 🆕 compare modal

interface Ingredient { id: string; name_en: string; name_ar: string; }
interface Category { id: string; name_en: string; name_ar: string; }

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
interface CartItem extends MenuItem { quantity: number; }

type OverlayPos = { top: number; left?: number; right?: number };

// scoped cart key per table
const cartKeyFor = (table: string) => `qr-cart-v1:${table || 'unknown'}`;

const CustomerMenu: React.FC = () => {
  const { t, isRTL } = useLanguage();

  // data
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState('');

  // ui
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showCartOverlay, setShowCartOverlay] = useState(false);
  const [overlayPos, setOverlayPos] = useState<OverlayPos>({ top: 0, right: 16 });

  // state
  const [loading, setLoading] = useState(true);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [error, setError] = useState<{ code: string; params?: Record<string, any> } | null>(null);

  // 🆕 compare
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) {
        // TODO: replace with a toast if you have one
        console.warn('You can compare up to 2 items');
        return prev;
      }
      return [...prev, id];
    });
  }, []);
  const clearCompare = useCallback(() => setCompareIds([]), []);
  const comparedItems = useMemo(
    () => menuItems.filter(m => compareIds.includes(m.id)),
    [menuItems, compareIds]
  );

  const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 640; // tailwind sm

  // currency (default QAR; change as needed)
  const currency = useMemo(
    () => new Intl.NumberFormat(isRTL ? 'ar-QA' : 'en-QA', { style: 'currency', currency: 'QAR' }),
    [isRTL]
  );

  // bootstrap
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table') || 'T01'; // fallback if missing param
    setTableNumber(table);
    loadMenuItems(table);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load selected category per table
  useEffect(() => {
    if (!tableNumber) return;
    const saved = sessionStorage.getItem(`qr-selected-category:${tableNumber}`);
    setSelectedCategory(saved || 'All');
  }, [tableNumber]);

  useEffect(() => {
    if (!tableNumber) return;
    sessionStorage.setItem(`qr-selected-category:${tableNumber}`, selectedCategory);
  }, [selectedCategory, tableNumber]);

  // cart persistence (per table)
  useEffect(() => {
    if (!tableNumber) return;
    try {
      const saved = sessionStorage.getItem(cartKeyFor(tableNumber));
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [tableNumber]);

  useEffect(() => {
    if (!tableNumber) return;
    try {
      sessionStorage.setItem(cartKeyFor(tableNumber), JSON.stringify(cart));
    } catch { /* ignore */ }
  }, [cart, tableNumber]);

  // fetch menu
  const loadMenuItems = async (tableCode: string) => {
    if (!tableCode) { setError({ code: 'status.tableNotFound' }); return; }
    try {
      setLoading(true);
      setError(null);

      const table = await tableService.getTableByCode(tableCode);
      if (!table) { setError({ code: 'status.tableNotFound', params: { table: tableCode } }); return; }

      const items = await menuService.getMenuItems(table.admin_id);
      if (!items || items.length === 0) { setError({ code: 'status.noMenuItems' }); return; }

      const transformed = items.map((item: any) => {
        const normalizedPrice =
          typeof item.price === 'number' ? item.price : parseFloat(item.price ?? '');
        return {
          id: item.id,
          name_en: item.name_en,
          name_ar: item.name_ar,
          price: Number.isFinite(normalizedPrice) ? normalizedPrice : 0,
          image_url: item.image_url || '/images/placeholder.png',
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
      setError({ code: 'status.failedToLoadMenu' });
      console.error('Error loading menu:', err);
    } finally {
      setLoading(false);
    }
  };

  // derived: filtered items
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return menuItems.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category_id === selectedCategory;

      const baseName = isRTL ? (item.name_ar || item.name_en) : item.name_en;
      const name = (baseName || '').toLowerCase();
      const nameMatch = term ? name.includes(term) : true;

      const ingredientMatch = term
        ? item.ingredients_details?.some(({ ingredient }) => {
          if (!ingredient) return false;
          const iname = isRTL ? ingredient.name_ar : ingredient.name_en;
          return ((iname || '').toLowerCase()).includes(term);
        })
        : false;

      return matchesCategory && (nameMatch || ingredientMatch);
    });
  }, [menuItems, selectedCategory, searchTerm, isRTL]);

  // derived: quantity map / totals
  const quantityMap = useMemo(
    () => Object.fromEntries(cart.map(i => [i.id, i.quantity])),
    [cart]
  );

  const totalItems = useMemo(
    () => cart.reduce((n, it) => n + it.quantity, 0),
    [cart]
  );

  const totalPrice = useMemo(
    () => cart.reduce((sum, it) => sum + it.price * it.quantity, 0),
    [cart]
  );

  // cart ops
  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const found = prev.find(c => c.id === item.id);
      if (found) return prev.map(c => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => {
      const found = prev.find(c => c.id === itemId);
      if (found && found.quantity > 1) return prev.map(c => (c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c));
      return prev.filter(c => c.id !== itemId);
    });
  }, []);

  const placeOrder = async () => {
    setIsOrdering(true);
    try {
      const orderItems = cart.map(item => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_order: item.price,
      }));
      await orderService.createOrder({ table_code: tableNumber, items: orderItems });
      setOrderPlaced(true);
      setShowCart(false);
      setCart([]);
      sessionStorage.removeItem(cartKeyFor(tableNumber)); // clear persisted cart
    } catch (err) {
      setError({ code: 'status.failedToPlaceOrder' });
      console.error('Error placing order:', err);
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
    const anchor = document.getElementById('header-cart-anchor');
    if (!anchor) return null;
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + offsetY + window.scrollY;
    if (isRTL) return { top, left: r.left + window.scrollX };
    return { top, right: window.innerWidth - r.right + window.scrollX };
  };

  useEffect(() => {
    if (!showCartOverlay) return;
    const update = () => {
      setOverlayPos(getAnchorPosition(10) || { top: 80, ...(isRTL ? { left: 16 } : { right: 16 }) });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [showCartOverlay, isRTL]);

  // close overlay on outside click / Esc / resize to mobile
  useEffect(() => {
    if (!showCartOverlay) return;

    const onDown = (e: MouseEvent) => {
      const anchor = document.getElementById('header-cart-anchor');
      const pop = document.getElementById('header-cart-popover');
      if (anchor?.contains(e.target as Node) || pop?.contains(e.target as Node)) return;
      setShowCartOverlay(false);
    };

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCartOverlay(false); };
    const onResize = () => { if (!isDesktop()) setShowCartOverlay(false); };

    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [showCartOverlay]);

  const onHeaderCartClick = () => {
    if (!totalItems) return;
    if (isDesktop()) setShowCartOverlay(v => !v);
    else setShowCart(true);
  };

  // views
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 shadow-soft">
            <ShoppingCart className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-slate-600 dark:text-slate-300">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 text-center max-w-md w-full animate-scale-in">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('status.errorLoadingMenu')}</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{t(error.code, error.params)}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition">
            {t('status.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (orderPlaced) return <OrderConfirmation tableNumber={tableNumber} />;

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* left: title & meta */}
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('restaurant.name')}</h1>
              <div className={`flex items-center text-sm text-slate-600 dark:text-slate-400 gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{t('orders.table')} {tableNumber}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  <span>{t('restaurant.phone')}</span>
                </div>
              </div>
            </div>
            {/* right: language toggle + cart — cart last, even in Arabic */}
            <div className="flex items-center gap-3" dir="ltr">
              <LanguageToggle variant="button" />
              <button
                id="header-cart-anchor"
                data-cart-anchor="header"
                onClick={onHeaderCartClick}
                className="relative px-3 py-2 rounded-lg bg-primary text-white flex items-center gap-2 hover:opacity-90 transition"
                aria-haspopup="dialog"
                aria-expanded={showCartOverlay}
                aria-controls="header-cart-popover"
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="font-medium hidden sm:inline">{currency.format(totalPrice)}</span>
                {totalItems > 0 && (
                  <span className={`absolute -top-2 ${isRTL ? '-left-2' : '-right-2'} bg-amber-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold animate-pulse`}>
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
              <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-3 w-5 h-5 text-slate-400 dark:text-slate-500`} />
              <input
                type="text"
                placeholder={t('menu.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
              />
            </div>

            {/* Category Filter (sticky under header while scrolling) */}
            <div className="sticky top-[76px] z-30 -mx-4 px-4 py-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xs border-b border-slate-200/60 dark:border-slate-700/60">
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
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
          compareIds={compareIds}            // 🆕 pass compare selection
          onToggleCompare={toggleCompare}    // 🆕 pass toggler
        />

        {filteredItems.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft border border-slate-200 dark:border-slate-700 p-12 text-center animate-fade-in">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('menu.noItemsFound')}</h3>
            <p className="text-slate-600 dark:text-slate-400">{t('menu.noItemsDescription')}</p>
          </div>
        )}
      </div>

      {/* Header cart popover (desktop only) */}
      {showCartOverlay && isDesktop() && (
        <div
          id="header-cart-popover"
          className="fixed z-[60] animate-scale-in"
          style={overlayPos as React.CSSProperties}
          role="dialog"
          aria-label={t('cart.miniCartAria')}
        >
          <div className="relative">
            {/* arrow */}
            <span
              className={[
                'absolute -top-2 block w-3 h-3 rotate-45',
                'bg-white dark:bg-slate-800',
                'border border-slate-200 dark:border-slate-700',
                isRTL ? 'left-6 border-l-0 border-b-0' : 'right-6 border-r-0 border-b-0',
              ].join(' ')}
              aria-hidden
            />
            <div className="w-[340px] max-w-[calc(100vw-24px)] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">{t('menu.yourOrder')}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{totalItems} {t('common.items') || 'items'}</span>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                {cart.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 dark:text-slate-400">{t('menu.cartEmpty')}</div>
                ) : (
                  cart.map((it) => (
                    <div key={it.id} className="p-3 flex items-center gap-3">
                      <img
                        src={it.image_url || '/images/placeholder.png'}
                        alt={isRTL ? (it.name_ar || it.name_en) : it.name_en}
                        className="w-10 h-10 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{isRTL ? it.name_ar || it.name_en : it.name_en}</span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{currency.format(it.price * it.quantity)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{it.quantity} × {currency.format(it.price)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{t('common.total')}</span>
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{currency.format(totalPrice)}</span>
                </div>
                <button
                  onClick={() => { setShowCartOverlay(false); setShowCart(true); }}
                  className="w-full rounded-lg bg-primary text-white py-2 font-semibold shadow hover:opacity-90 transition"
                >
                  {t('cart.viewOrder')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
        />
      )}

      {/* 🆕 Sticky compare bar (above order bar) */}
      {compareIds.length > 0 && !showCart && (
        <div
          className="fixed inset-x-0 z-20 bottom-16 sm:bottom-20"  // 
        >
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex items-center justify-between bg-slate-900 text-white rounded-xl shadow-lg px-4 py-3">
              <span className="text-sm">
                {(t('menu.compareCount', { n: String(compareIds.length) }) || 'Selected to compare:')} {compareIds.length}/2
              </span>
              <div className="flex gap-2">
                <button onClick={clearCompare} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">
                  {t('common.clear') || 'Clear'}
                </button>
                <button
                  disabled={compareIds.length < 2}
                  onClick={() => setShowCompare(true)}
                  className={`px-3 py-2 rounded-lg ${compareIds.length < 2 ? 'bg-white/20 cursor-not-allowed' : 'bg-primary hover:opacity-90'}`}
                >
                  {t('menu.compare') || 'Compare'}
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
              onClick={() => setShowCart(true)}
              className="w-full flex items-center justify-between gap-3 rounded-2xl bg-primary text-white px-4 py-3 shadow-soft hover:opacity-90 transition"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="font-semibold">{t('cart.viewOrder')}</span>
              </div>
              <div className={`flex items-center gap-2 text-sm ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
                  <Check className="w-4 h-4" /> {totalItems}
                </span>
                <span className="font-bold">{currency.format(totalPrice)}</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Floating cart (when empty) */}
      {totalItems === 0 && (
        <FloatingCartButton itemCount={0} isRTL={isRTL} onClick={() => setShowCart(true)} />
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
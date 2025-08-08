import React, { useState, useEffect } from 'react';
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

const CART_KEY = 'qr-cart-v1';

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
  const [overlayPos, setOverlayPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, right: 16 });

  // state
  const [loading, setLoading] = useState(true);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [error, setError] = useState('');

  const isDesktop = () => window.innerWidth >= 640; // tailwind sm

  // bootstrap
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table') || 'T01';
    setTableNumber(table);
    loadMenuItems(table);
  }, []);

  // cart persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch { /* ignore */ }
  }, [cart]);

  // fetch menu
  const loadMenuItems = async (tableCode: string) => {
    if (!tableCode) { setError(t('status.tableNotFound')); return; }
    try {
      setLoading(true);
      const table = await tableService.getTableByCode(tableCode);
      if (!table) { setError(t('status.tableNotFound', { table: tableCode })); return; }

      const items = await menuService.getMenuItems(table.admin_id);
      if (!items || items.length === 0) { setError(t('status.noMenuItems')); return; }

      const transformed = items.map((item: any) => ({
        id: item.id,
        name_en: item.name_en,
        name_ar: item.name_ar,
        price: item.price,
        image_url: item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400',
        available: item.available,
        created_at: item.created_at,
        category_id: item.category_id,
        ingredients_details: item.ingredients_details || [],
        categories: item.categories || undefined,
      })) as MenuItem[];

      setMenuItems(transformed);

      const categoryMap = new Map<string, Category>();
      items.forEach((it: any) => {
        if (it.categories && !categoryMap.has(it.categories.id)) {
          categoryMap.set(it.categories.id, it.categories);
        }
      });
      setCategories(Array.from(categoryMap.values()));
    } catch (err) {
      setError(t('status.failedToLoadMenu'));
      console.error('Error loading menu:', err);
    } finally {
      setLoading(false);
    }
  };

  // filter
  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category_id === selectedCategory;
    const term = searchTerm.toLowerCase();
    const name = (isRTL ? item.name_ar || item.name_en : item.name_en)?.toLowerCase() || '';
    const nameMatch = name.includes(term);
    const ingredientMatch = item.ingredients_details?.some(({ ingredient }) =>
      (isRTL ? ingredient.name_ar : ingredient.name_en).toLowerCase().includes(term)
    );
    return matchesCategory && (nameMatch || !!ingredientMatch);
  });

  // helpers
  const getTotalPrice = () => cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const getTotalItems = () => cart.reduce((total, item) => total + item.quantity, 0);

  // cart ops
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const found = prev.find(c => c.id === item.id);
      if (found) return prev.map(c => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, { ...item, quantity: 1 }];
    });
  };
  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const found = prev.find(c => c.id === itemId);
      if (found && found.quantity > 1) return prev.map(c => (c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c));
      return prev.filter(c => c.id !== itemId);
    });
  };

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
      setTimeout(() => setOrderPlaced(false), 5000);
    } catch (err) {
      setError(t('status.failedToPlaceOrder'));
      console.error('Error placing order:', err);
    } finally {
      setIsOrdering(false);
    }
  };

  // overlay positioning
  function getAnchorPosition(offsetY = 8) {
    const anchor = document.getElementById('header-cart-anchor');
    if (!anchor) return null;
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + offsetY + window.scrollY;
    if (isRTL) return { top, left: r.left + window.scrollX };
    return { top, right: window.innerWidth - r.right + window.scrollX };
  }

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

  useEffect(() => {
    if (!showCartOverlay) return;
    const onDown = (e: MouseEvent) => {
      const anchor = document.getElementById('header-cart-anchor');
      const pop = document.getElementById('header-cart-popover');
      if (anchor?.contains(e.target as Node) || pop?.contains(e.target as Node)) return;
      setShowCartOverlay(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [showCartOverlay]);

  const onHeaderCartClick = () => {
    if (!getTotalItems()) return;
    if (isDesktop()) setShowCartOverlay((v) => !v);
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
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
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
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="font-medium hidden sm:inline">${getTotalPrice().toFixed(2)}</span>
                {getTotalItems() > 0 && (
                  <span className={`absolute -top-2 ${isRTL ? '-left-2' : '-right-2'} bg-amber-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold animate-pulse`}>
                    {getTotalItems()}
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
          quantityMap={Object.fromEntries(cart.map(item => [item.id, item.quantity]))}
          onAdd={addToCart}
          onRemove={removeFromCart}
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
          style={overlayPos}
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
                  <span className="text-sm text-slate-500 dark:text-slate-400">{getTotalItems()} {t('common.items') || 'items'}</span>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                {cart.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 dark:text-slate-400">{t('menu.cartEmpty')}</div>
                ) : (
                  cart.map((it) => (
                    <div key={it.id} className="p-3 flex items-center gap-3">
                      <img
                        src={it.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'}
                        alt={it.name_en}
                        className="w-10 h-10 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{isRTL ? it.name_ar || it.name_en : it.name_en}</span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">${(it.price * it.quantity).toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{it.quantity} × ${it.price.toFixed(2)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{t('common.total')}</span>
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">${getTotalPrice().toFixed(2)}</span>
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

      {/* Sticky bottom order bar */}
      {!showCart && getTotalItems() > 0 && (
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
                  <Check className="w-4 h-4" /> {getTotalItems()}
                </span>
                <span className="font-bold">${getTotalPrice().toFixed(2)}</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Floating cart (when empty) */}
      {getTotalItems() === 0 && (
        <FloatingCartButton itemCount={0} isRTL={isRTL} onClick={() => setShowCart(true)} />
      )}
    </div>
  );
};

export default CustomerMenu;
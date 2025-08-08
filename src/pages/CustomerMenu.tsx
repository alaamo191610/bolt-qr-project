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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table') || 'T01';
    setTableNumber(table);
    loadMenuItems(table);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) setCart(JSON.parse(saved));
    } catch { }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch { }
  }, [cart]);

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
      }));

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

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category_id === selectedCategory;
    const nameMatch = (isRTL ? item.name_ar || item.name_en : item.name_en)?.toLowerCase().includes(searchTerm.toLowerCase());
    const ingredientMatch = item.ingredients_details?.some(({ ingredient }) =>
      (isRTL ? ingredient.name_ar : ingredient.name_en).toLowerCase().includes(searchTerm.toLowerCase())
    );
    return matchesCategory && (nameMatch || !!ingredientMatch);
  });

  const flashToast = (msg: string) => {
    setFlash(msg);
    window.clearTimeout((flashToast as any)._t);
    (flashToast as any)._t = window.setTimeout(() => setFlash(null), 1100);
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const found = prev.find(c => c.id === item.id);
      if (found) return prev.map(c => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, { ...item, quantity: 1 }];
    });
    flashToast(isRTL ? 'تمت الإضافة إلى السلة' : 'Added to cart');
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const found = prev.find(c => c.id === itemId);
      if (found && found.quantity > 1) return prev.map(c => (c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c));
      return prev.filter(c => c.id !== itemId);
    });
  };

  const getTotalPrice = () => cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const getTotalItems = () => cart.reduce((total, item) => total + item.quantity, 0);

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
      {/* Language Toggle */}
      <div className={`fixed top-4 ${isRTL ? 'left-4' : 'right-4'} z-50`}>
        <LanguageToggle variant="button" />
      </div>

      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
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

            {/* Top Cart Button (desktop) — ANCHOR */}
            <button
              id="header-cart-anchor"
              data-cart-anchor="header"
              onClick={() => setShowCart(!showCart)}
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

      {/* Sticky bottom order bar — ANCHOR */}
      {!showCart && getTotalItems() > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 animate-slide-up">
          <div className="max-w-4xl mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              data-cart-anchor
              onClick={() => setShowCart(true)}
              className="w-full flex items-center justify-between gap-3 rounded-2xl bg-primary text-white px-4 py-3 shadow-soft hover:opacity-90 transition"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="font-semibold">{isRTL ? 'عرض الطلب' : 'View Order'}</span>
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

      {/* Invisible cart anchor BEFORE first add */}
      {getTotalItems() === 0 && (
        <FloatingCartButton itemCount={0} isRTL={isRTL} onClick={() => setShowCart(true)} />
      )}

      {/* Tiny toast */}
      {flash && (
        <div className={`fixed top-20 ${isRTL ? 'left-4' : 'right-4'} z-50 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg shadow-soft animate-scale-in`}>
          {flash}
        </div>
      )}
    </div>
  );
};

export default CustomerMenu;
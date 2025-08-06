import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Search, Filter, Clock, MapPin, Phone } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { menuService } from '../services/menuService';
import { orderService } from '../services/orderService';
import { tableService } from '../services/tableService';
import LanguageToggle from '../components/LanguageToggle';
import CartDrawer from '../components/ui/CartDrawer';
import CategoryFilter from '../components/ui/CategoryFilter';
import MenuGrid from '../components/ui/MenuGrid';
import FloatingCartButton from '../components/ui/FloatingCartButton';
import OrderConfirmation from '../components/ui/OrderConfirmation';

interface MenuItem {
  id: string;
  name_en: string;
  name_ar?: string;
  description: string;
  price: number;
  category: string;
  image_url?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

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
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');


  useEffect(() => {
    // Get table number from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table') || 'T01';
    setTableNumber(table);

    // Load menu items
    loadMenuItems(table);
  }, []);

  const loadMenuItems = async (tableCode: string) => {
    if (!tableCode) {
      setError(t('status.tableNotFound'));
      return;
    }
    try {
      setLoading(true);

      // Get table info to determine which admin's menu to load
      const table = await tableService.getTableByCode(tableCode);
      if (!table) {
        setError(t('status.tableNotFound', { table: tableCode }));
        return;
      }

      const items = await menuService.getMenuItems(table.admin_id);

      if (!items || items.length === 0) {
        setError(t('status.noMenuItems'));
        return;
      }

      // Transform data to match component interface
      const transformedItems = items.map(item => ({
        id: item.id,
        name_en: item.name_en,
        name_ar: item.name_ar,
        description: item.name_ar || item.name_en, // Use Arabic as description if available
        price: item.price,
        category: item.categories?.name_en || 'Other',
        image_url: item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400'
      }));

      setMenuItems(transformedItems);

      // Extract unique categories
      const uniqueCategories = ['All', ...Array.from(new Set(transformedItems.map(item => item.category)))];
      setCategories(uniqueCategories);
    } catch (err) {
      setError(t('status.failedToLoadMenu'));
      console.error('Error loading menu:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = (item: MenuItem) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.id === item.id);
      if (existingItem) {
        return prevCart.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      } else {
        return [...prevCart, { ...item, quantity: 1 }];
      }
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.id === itemId);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map(cartItem =>
          cartItem.id === itemId
            ? { ...cartItem, quantity: cartItem.quantity - 1 }
            : cartItem
        );
      } else {
        return prevCart.filter(cartItem => cartItem.id !== itemId);
      }
    });
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const getItemQuantity = (itemId: string) => {
    const cartItem = cart.find(item => item.id === itemId);
    return cartItem ? cartItem.quantity : 0;
  };

  const placeOrder = async () => {
    setIsOrdering(true);

    try {
      const orderItems = cart.map(item => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_order: item.price
      }));

      await orderService.createOrder({
        table_code: tableNumber,
        items: orderItems
      });

      setOrderPlaced(true);
      setShowCart(false);
      setCart([]);

      // Reset after 5 seconds
      setTimeout(() => {
        setOrderPlaced(false);
      }, 5000);
    } catch (err) {
      setError(t('status.failedToPlaceOrder'));
      console.error('Error placing order:', err);
    } finally {
      setIsOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('status.errorLoadingMenu')}</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200"
          >
            {t('status.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (orderPlaced) {
    return <OrderConfirmation tableNumber={tableNumber} />;
  }
  

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Language Toggle - Top Right */}
      <div className={`fixed top-4 ${isRTL ? 'left-4' : 'right-4'} z-50`}>
        <LanguageToggle variant="button" />
      </div>

      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white gradient-text">{t('restaurant.name')}</h1>
              <div className={`flex items-center space-x-4 ${isRTL ? 'space-x-reverse' : ''} text-sm text-slate-600 dark:text-slate-400`}>
                <div className={`flex items-center space-x-1 ${isRTL ? 'space-x-reverse' : ''}`}>
                  <MapPin className="w-4 h-4" />
                  <span>{t('orders.table')} {tableNumber}</span>
                </div>
                <div className={`flex items-center space-x-1 ${isRTL ? 'space-x-reverse' : ''}`}>
                  <Phone className="w-4 h-4" />
                  <span>{t('restaurant.phone')}</span>
                </div>
              </div>
            </div>

            {/* Cart Button */}
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative btn-primary mobile-padding"
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
        {/* Search and Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 mb-6 card-hover">
          <div className="flex flex-col space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-3 w-5 h-5 text-slate-400 dark:text-slate-500`} />
              <input
                type="text"
                placeholder={t('menu.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent`}
              />
            </div>

            {/* Category Filter */}
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={(cat) => setSelectedCategory(cat)}
            />
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('menu.noItemsFound')}</h3>
            <p className="text-slate-600 dark:text-slate-400">{t('menu.noItemsDescription')}</p>
          </div>
        )}
      </div>

      {/* Cart Overlay */}
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

      {/* Floating Cart Button for Mobile */}
      {!showCart && getTotalItems() > 0 && (
        <FloatingCartButton
          itemCount={getTotalItems()}
          isRTL={isRTL}
          onClick={() => setShowCart(true)}
        />
      )}
    </div>
  );
};

export default CustomerMenu;
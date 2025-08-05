import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Search, Filter, Clock, MapPin, Phone } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { menuService } from '../services/menuService';
import { orderService } from '../services/orderService';
import { tableService } from '../services/tableService';
import LanguageToggle from '../components/LanguageToggle';

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
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('menu.orderPlaced')}</h2>
          <p className="text-slate-600 mb-4">
            {t('menu.orderPlacedDescription', { table: tableNumber })}
          </p>
          <div className={`flex items-center justify-center space-x-2 ${isRTL ? 'space-x-reverse' : ''} text-sm text-slate-500`}>
            <Clock className="w-4 h-4" />
            <span>{t('menu.estimatedTime')}</span>
          </div>
        </div>
      </div>
    );
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
            <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 ${selectedCategory === category
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                  {category === 'All' ? t('menu.all') : category}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="space-y-4">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden card-hover">
              <div className="flex">
                <img
                  src={item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400'}
                  alt={item.name_en}
                  className="w-24 h-24 sm:w-32 sm:h-32 object-cover flex-shrink-0 rounded-l-2xl"
                />
                <div className="flex-1 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 pr-4">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{item.name_en}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{item.description}</p>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">${item.price}</span>
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-xs font-medium">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    {/* Add to Cart Controls */}
                    <div className="flex-shrink-0">
                      {getItemQuantity(item.id) > 0 ? (
                        <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="w-8 h-8 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-full flex items-center justify-center transition-colors duration-200"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-bold text-lg min-w-[2rem] text-center text-slate-900 dark:text-white">
                            {getItemQuantity(item.id)}
                          </span>
                          <button
                            onClick={() => addToCart(item)}
                            className="w-8 h-8 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-full flex items-center justify-center transition-all duration-200 shadow-lg"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl transition-all duration-200 font-medium text-sm shadow-lg"
                        >
                          {t('menu.addToCart')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden animate-slide-in">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('menu.yourOrder')}</h3>
                <button
                  onClick={() => setShowCart(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('orders.table')} {tableNumber}</p>
            </div>

            <div className="overflow-y-auto max-h-96">
              {cart.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShoppingCart className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{t('menu.cartEmpty')}</p>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-xl">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900 dark:text-white">{item.name_en}</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">${item.price} {t('menu.each')}</p>
                      </div>
                      <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-6 h-6 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-full flex items-center justify-center transition-colors duration-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-medium min-w-[1.5rem] text-center text-slate-900 dark:text-white">{item.quantity}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-6 h-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-full flex items-center justify-center transition-all duration-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-6 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center text-xl font-bold text-slate-900 dark:text-white mb-4">
                  <span>{t('common.total')}:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">${getTotalPrice().toFixed(2)}</span>
                </div>
                <button
                  onClick={placeOrder}
                  disabled={isOrdering}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isOrdering ? (
                    <div className={`flex items-center justify-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{t('status.placingOrder')}</span>
                    </div>
                  ) : (
                    t('menu.placeOrder')
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Cart Button for Mobile */}
      {!showCart && getTotalItems() > 0 && (
        <button
          onClick={() => setShowCart(true)}
          className={`fixed bottom-6 ${isRTL ? 'left-6' : 'right-6'} bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-40 animate-pulse-slow`}
        >
          <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
            <ShoppingCart className="w-5 h-5" />
            <span className="font-medium bg-white text-emerald-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">
              {getTotalItems()}
            </span>
          </div>
        </button>
      )}
    </div>
  );
};

export default CustomerMenu;
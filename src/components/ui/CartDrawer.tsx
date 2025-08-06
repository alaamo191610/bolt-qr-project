import React from 'react';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { MenuItem } from './MenuItemCard';

interface CartItem extends MenuItem {
  quantity: number;
}

interface Props {
  cart: CartItem[];
  tableNumber: string;
  isRTL: boolean;
  isOrdering: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
  onPlaceOrder: () => void;
}

const CartDrawer: React.FC<Props> = ({
  cart,
  tableNumber,
  isRTL,
  isOrdering,
  onClose,
  onAdd,
  onRemove,
  onPlaceOrder,
}) => {
  const { t } = useLanguage();

  const getTotalPrice = () =>
    cart.reduce((total, item) => total + item.price * item.quantity, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {t('menu.yourOrder')}
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('orders.table')} {tableNumber}
          </p>
        </div>

        {/* Body */}
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
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-xl"
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {item.name_en}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      ${item.price} {t('menu.each')}
                    </p>
                  </div>
                  <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="w-6 h-6 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-full flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-medium min-w-[1.5rem] text-center text-slate-900 dark:text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onAdd(item)}
                      className="w-6 h-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-full flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center text-xl font-bold text-slate-900 dark:text-white mb-4">
              <span>{t('common.total')}:</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                ${getTotalPrice().toFixed(2)}
              </span>
            </div>
            <button
              onClick={onPlaceOrder}
              disabled={isOrdering}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOrdering ? (
                <div className={`flex items-center justify-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
  );
};

export default CartDrawer;
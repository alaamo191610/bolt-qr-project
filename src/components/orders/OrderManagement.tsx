import React, { useState } from 'react';
import { Clock, CheckCircle, AlertCircle, User, DollarSign, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';

interface Order {
  id: number;
  order_number?: number;
  tableNumber: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
  timestamp: Date;
}

interface OrderManagementProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  onStatusChange?: (orderId: number, newStatus: Order['status']) => void;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ orders, setOrders, onStatusChange }) => {
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const updateOrderStatus = (orderId: number, newStatus: Order['status']) => {
    // Optimistic update
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
    );

    // Call parent to persist
    if (onStatusChange) {
      onStatusChange(orderId, newStatus);
    }
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'preparing': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400';
      case 'ready': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400';
      case 'served': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-5 h-5" />;
      case 'preparing': return <AlertCircle className="w-5 h-5" />;
      case 'ready': return <CheckCircle className="w-5 h-5" />;
      case 'served': return <CheckCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const formatTime = (timestamp: string | Date) => {
    const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  };

  const getNextStatus = (s: Order['status']): Order['status'] =>
    s === 'pending' ? 'preparing' :
      s === 'preparing' ? 'ready' :
        s === 'ready' ? 'served' : s;

  const canAdvanceStatus = (s: Order['status']) => s !== 'served';

  const list = orders ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Order Management</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Track and manage all incoming orders</p>
          </div>
        </div>

        {/* Stats - Mobile optimized grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 p-3 sm:p-4 rounded-lg border border-yellow-200 dark:border-yellow-700">
            <div className="text-xl sm:text-2xl font-bold text-yellow-800 dark:text-yellow-400">
              {list.filter(o => o.status === 'pending').length}
            </div>
            <div className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-500">Pending</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-3 sm:p-4 rounded-lg border border-blue-200 dark:border-blue-700">
            <div className="text-xl sm:text-2xl font-bold text-blue-800 dark:text-blue-400">
              {list.filter(o => o.status === 'preparing').length}
            </div>
            <div className="text-xs sm:text-sm text-blue-700 dark:text-blue-500">Preparing</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-3 sm:p-4 rounded-lg border border-green-200 dark:border-green-700">
            <div className="text-xl sm:text-2xl font-bold text-green-800 dark:text-green-400">
              {list.filter(o => o.status === 'ready').length}
            </div>
            <div className="text-xs sm:text-sm text-green-700 dark:text-green-500">Ready</div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800 dark:to-slate-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-300">
              ${list.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(2)}
            </div>
            <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-400">Total Sales</div>
          </div>
        </div>
      </div>

      {/* Orders List - Mobile Optimized */}
      <div className="space-y-3 sm:space-y-4">
        {list.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            expanded={expandedOrder === order.id}
            onToggleExpand={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
            onUpdateStatus={updateOrderStatus}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            formatTime={formatTime}
            getNextStatus={getNextStatus}
            canAdvanceStatus={canAdvanceStatus}
          />
        ))}
      </div>

      {list.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 sm:p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">No Orders Yet</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Orders will appear here when customers place them through the QR menu.</p>
        </div>
      )}
    </div>
  );
};

// Separate OrderCard component for better organization and swipe functionality
interface OrderCardProps {
  order: Order;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdateStatus: (orderId: number, newStatus: Order['status']) => void;
  getStatusColor: (status: Order['status']) => string;
  getStatusIcon: (status: Order['status']) => JSX.Element;
  formatTime: (timestamp: string | Date) => string;
  getNextStatus: (status: Order['status']) => Order['status'];
  canAdvanceStatus: (status: Order['status']) => boolean;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  expanded,
  onToggleExpand,
  onUpdateStatus,
  getStatusColor,
  getStatusIcon,
  formatTime,
  getNextStatus,
  canAdvanceStatus,
}) => {
  const handleSwipeLeft = () => {
    if (canAdvanceStatus(order.status)) {
      onUpdateStatus(order.id, getNextStatus(order.status));
    }
  };

  const [swipeHandlers, swipeOffset] = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    minSwipeDistance: 60,
  });

  const nextStatus = getNextStatus(order.status);
  const showSwipeIndicator = swipeOffset < -20 && canAdvanceStatus(order.status);

  return (
    <div
      {...swipeHandlers}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-all duration-200 relative select-none touch-pan-y"
      style={{
        transform: showSwipeIndicator ? `translateX(${Math.max(swipeOffset, -100)}px)` : 'translateX(0)',
        transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
      }}
    >
      {/* Swipe indicator background */}
      {showSwipeIndicator && (
        <div className="absolute inset-y-0 right-0 w-24 bg-emerald-600 flex items-center justify-center">
          <ArrowLeft className="w-6 h-6 text-white animate-pulse" />
        </div>
      )}

      <div className="p-4 sm:p-6">
        {/* Order Header - Mobile optimized */}
        <div className="flex justify-between items-start mb-3 sm:mb-4">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Order #{order.order_number ?? order.id}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Table {order.tableNumber} • {formatTime(order.timestamp)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">${Number(order.total).toFixed(2)}</div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-between mb-4">
          <span className={`inline-flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium border ${getStatusColor(order.status)}`}>
            {getStatusIcon(order.status)}
            <span>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
          </span>
        </div>

        {/* Action Buttons - LARGE for mobile */}
        {canAdvanceStatus(order.status) && (
          <div className="space-y-2">
            <button
              onClick={() => onUpdateStatus(order.id, nextStatus)}
              className="w-full min-h-[56px] px-6 py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-base sm:text-lg font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 shadow-md hover:shadow-lg active:scale-[0.98]"
            >
              <span>Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              💡 Tip: Swipe left on the card to quickly advance
            </p>
          </div>
        )}

        {/* Expandable Items Section */}
        <button
          onClick={onToggleExpand}
          className="w-full mt-4 flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {order.items.length} Item{order.items.length !== 1 ? 's' : ''}
          </span>
          <ChevronRight
            className={`w-5 h-5 text-slate-600 dark:text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''
              }`}
          />
        </button>

        {/* Items List - Collapsible */}
        {expanded && (
          <div className="mt-3 space-y-2 animate-slide-up">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between items-center py-2 px-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="w-7 h-7 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {item.quantity}
                  </span>
                  <span className="text-sm text-slate-900 dark:text-white font-medium">{item.name}</span>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderManagement;

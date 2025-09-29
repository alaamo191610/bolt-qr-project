import React from 'react';
import { Clock, CheckCircle, AlertCircle, User, DollarSign } from 'lucide-react';
import type { Order as Order } from '../services/orderService';
type UIStatus = Order['status'];  
interface OrderManagementProps {
  orders: Order[];
  adminId?: string;
  onUpdateStatus: (id: string, uiStatus: UIStatus) => Promise<void>;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ orders, onUpdateStatus }) => {
  
  const [updating, setUpdating] = React.useState<Set<string>>(new Set());

  const getNextStatus = (s: UIStatus): UIStatus =>
    s === 'pending' ? 'preparing' : s === 'preparing' ? 'ready' : s === 'ready' ? 'served' : s;

  const canAdvanceStatus = (s: UIStatus) => s !== 'served' && s !== 'cancelled';

// inside OrderManagement.tsx
const updateOrderStatus = async (orderId: string, newStatus: UIStatus) => {
  if (updating.has(orderId)) return;           // avoid double-clicks
  setUpdating(s => new Set(s).add(orderId));   // show "Updating…"

  try {
    // Parent passes a mutation wrapper that maps UI->DB and does optimistic cache update
    await onUpdateStatus(orderId, newStatus);
  } catch (e) {
    console.error('Failed to update order status:', e);
  } finally {
    setUpdating(s => {
      const n = new Set(s);
      n.delete(orderId);
      return n;
    });
  }
};


  const getStatusColor = (status: UIStatus) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'preparing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ready': return 'bg-green-100 text-green-800 border-green-200';
      case 'served': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: UIStatus) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'preparing': return <AlertCircle className="w-4 h-4" />;
      case 'ready': return <CheckCircle className="w-4 h-4" />;
      case 'served': return <CheckCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatTime = (timestamp: string | Date) => {
    const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  const list = orders ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Order Management</h2>
            <p className="text-slate-600">Track and manage all incoming orders</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Pending */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-800">
              {list.filter(o => o.status === 'pending').length}
            </div>
            <div className="text-sm text-yellow-700">Pending</div>
          </div>

          {/* Preparing */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-800">
              {list.filter(o => o.status === 'preparing').length}
            </div>
            <div className="text-sm text-blue-700">Preparing</div>
          </div>

          {/* Ready */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-800">
              {list.filter(o => o.status === 'ready').length}
            </div>
            <div className="text-sm text-green-700">Ready</div>
          </div>

          {/* Served */}
          <div className="bg-gradient-to-br from-gray-50 to-slate-100 p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-slate-800">
              {list.filter(o => o.status === 'served').length}
            </div>
            <div className="text-sm text-slate-700">Served</div>
          </div>

          {/* Cancelled */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 p-4 rounded-lg border border-red-200">
            <div className="text-2xl font-bold text-red-800">
              {list.filter(o => o.status === 'cancelled').length}
            </div>
            <div className="text-sm text-red-700">Cancelled</div>
          </div>
        </div>

        {/* Total Sales Row */}
        <div className="mt-4 bg-gradient-to-br btn-primary p-6 rounded-lg border border-emerald-200 text-center">
          <div className="text-3xl font-bold text-white">
            ${list.reduce((sum, o) => sum + o.total, 0).toFixed(2)}
          </div>
          <div className="text-sm text-white">Total Sales</div>
        </div>

      </div>

      {/* Orders List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {list.map(order => {
          const next = getNextStatus(order.status);
          const isUpdating = updating.has(order.id);
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-all duration-200">
              {/* Order Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Order #{order.order_number ?? order.id}
                    </h3>
                    <p className="text-sm text-slate-600">Table {order.tableNumber}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-600">${order.total.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">Ordered At: {formatTime(order.timestamp)}</div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(order.status)}`}
                >
                  {getStatusIcon(order.status)}
                  <span>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
                </span>

                <div className="flex gap-2">
                  {canAdvanceStatus(order.status) && (
                    <button
                      onClick={() => updateOrderStatus(order.id, next)}
                      disabled={isUpdating}
                      className={`px-4 py-2 text-white text-sm rounded-lg transition-colors duration-200 font-medium ${isUpdating
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      aria-busy={isUpdating}
                    >
                      {isUpdating ? 'Updating…' : `Mark as ${next.charAt(0).toUpperCase() + next.slice(1)}`}
                    </button>
                  )}

                  {/* Cancel button */}
                  {order.status !== 'cancelled' && order.status !== 'served' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      disabled={isUpdating}
                      className={`px-4 py-2 text-white text-sm rounded-lg transition-colors duration-200 font-medium ${isUpdating
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700'
                        }`}
                      aria-busy={isUpdating}
                    >
                      {isUpdating ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>


              {/* Order Items */}
              <div className="space-y-2">
                <h4 className="font-medium text-slate-900 mb-2">Items:</h4>
                {order.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 bg-slate-200 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold">
                        {item.quantity}
                      </span>
                      <span className="text-sm text-slate-900">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {list.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No Orders Yet</h3>
          <p className="text-slate-600">Orders will appear here when customers place them through the QR menu.</p>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;

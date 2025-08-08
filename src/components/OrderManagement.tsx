import React from 'react';
import { Clock, CheckCircle, AlertCircle, User, DollarSign } from 'lucide-react';

interface Order {
  id: number;
  order_number?: number; // <- lowercase number, and optional
  tableNumber: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
  timestamp: string | Date; // accept ISO string too
}

interface OrderManagementProps {
  orders: Order[]; // <- LOWERCASE to match parent usage
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ orders, setOrders }) => {
  const updateOrderStatus = (orderId: number, newStatus: Order['status']) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':   return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'preparing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ready':     return 'bg-green-100 text-green-800 border-green-200';
      case 'served':    return 'bg-gray-100 text-gray-800 border-gray-200';
      default:          return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending':   return <Clock className="w-4 h-4" />;
      case 'preparing': return <AlertCircle className="w-4 h-4" />;
      case 'ready':     return <CheckCircle className="w-4 h-4" />;
      case 'served':    return <CheckCircle className="w-4 h-4" />;
      default:          return <Clock className="w-4 h-4" />;
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

  const getNextStatus = (s: Order['status']): Order['status'] =>
    s === 'pending' ? 'preparing' :
    s === 'preparing' ? 'ready' :
    s === 'ready' ? 'served' : s;

  const canAdvanceStatus = (s: Order['status']) => s !== 'served';

  const list = orders ?? []; // defensive (optional)

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-800">
              {list.filter(o => o.status === 'pending').length}
            </div>
            <div className="text-sm text-yellow-700">Pending</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-800">
              {list.filter(o => o.status === 'preparing').length}
            </div>
            <div className="text-sm text-blue-700">Preparing</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-800">
              {list.filter(o => o.status === 'ready').length}
            </div>
            <div className="text-sm text-green-700">Ready</div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-slate-50 p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-800">
              ${list.reduce((sum, o) => sum + o.total, 0).toFixed(2)}
            </div>
            <div className="text-sm text-gray-700">Total Sales</div>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {list.map(order => (
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
              <span className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(order.status)}`}>
                {getStatusIcon(order.status)}
                <span>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
              </span>

              {canAdvanceStatus(order.status) && (
                <button
                  onClick={() => updateOrderStatus(order.id, getNextStatus(order.status))}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors duration-200 font-medium"
                >
                  Mark as {getNextStatus(order.status).charAt(0).toUpperCase() + getNextStatus(order.status).slice(1)}
                </button>
              )}
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
        ))}
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

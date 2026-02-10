import React, { useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  ArrowRight,
  Search,
  Calendar,
  AlertTriangle,
  History,
  LayoutList,
  Utensils,
  X
} from 'lucide-react';

// --- Types ---
interface Order {
  id: number;
  order_number?: number;
  tableNumber: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  timestamp: Date | string;
  type?: 'dine_in' | 'take_away';
}

interface OrderManagementProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  onStatusChange?: (orderId: number, newStatus: Order['status']) => void;
}

// --- Components ---

const OrderManagement: React.FC<OrderManagementProps> = ({ orders, setOrders, onStatusChange }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionType, setActionType] = useState<'status_change' | 'cancel' | null>(null);
  const [targetStatus, setTargetStatus] = useState<Order['status'] | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | 'all'>('all');

  // --- Filtering Logic ---
  const baseFilteredOrders = useMemo(() => {
    return (orders || []).filter(order => {
      if (!order) return false;

      let matchesDate = true;
      if (selectedDate) {
        try {
          const orderDate = new Date(order.timestamp).toLocaleDateString('en-CA');
          matchesDate = orderDate === selectedDate;
        } catch (e) {
          matchesDate = false;
        }
      }

      // Search Filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        (order.order_number?.toString() || '').includes(searchLower) ||
        (order.tableNumber || '').toLowerCase().includes(searchLower) ||
        (order.id?.toString() || '').includes(searchLower);

      return matchesDate && matchesSearch;
    });
  }, [orders, selectedDate, searchTerm]);

  // 2. Filter by View Mode (Active vs History) AND Selected Status for the List
  const displayOrders = useMemo(() => {
    return baseFilteredOrders.filter(order => {
      // First check View Mode
      const isActiveView = ['pending', 'preparing', 'ready'].includes(order.status);
      if (viewMode === 'active' && !isActiveView) return false;
      if (viewMode === 'history' && isActiveView) return false; // Served or Cancelled

      // Then check Status Filter
      if (selectedStatus !== 'all' && order.status !== selectedStatus) return false;

      return true;
    });
  }, [baseFilteredOrders, viewMode, selectedStatus]);

  // Reset status filter when view mode changes
  const handleViewModeChange = (mode: 'active' | 'history') => {
    setViewMode(mode);
    setSelectedStatus('all');
  };

  // --- Actions ---
  const handleStatusClick = (order: Order, status: Order['status']) => {
    setSelectedOrder(order);
    setTargetStatus(status);
    setActionType('status_change');
    setShowConfirmModal(true);
  };

  const handleCancelClick = (order: Order) => {
    setSelectedOrder(order);
    setTargetStatus('cancelled');
    setActionType('cancel');
    setShowConfirmModal(true);
  };

  const confirmAction = () => {
    if (selectedOrder && targetStatus) {
      // Optimistic update
      setOrders(prev =>
        prev.map(o => (o.id === selectedOrder.id ? { ...o, status: targetStatus } : o))
      );

      if (onStatusChange) {
        onStatusChange(selectedOrder.id, targetStatus);
      }

      setShowConfirmModal(false);
      setSelectedOrder(null);
      setTargetStatus(null);
      setActionType(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in p-2">
      {/* Sticky Header */}
      <div className="bg-white/90 dark:bg-slate-800/90 rounded-3xl shadow-lg border border-slate-200/50 dark:border-slate-700/50 p-6 sticky top-4 z-20 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 transform hover:scale-105 transition-transform duration-300">
              <Utensils className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Order Management</h2>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleViewModeChange('active')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'active'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700/50'
                    : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                    }`}
                >
                  Active
                </button>
                <button
                  onClick={() => handleViewModeChange('history')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'history'
                    ? 'bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-700/50 dark:text-white dark:border-slate-600'
                    : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                    }`}
                >
                  History
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Search Orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none"
              />
            </div>

            {/* Date Filter */}
            <div className="relative group">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none text-slate-700 dark:text-slate-300"
              />
              {/* Clear Date Button */}
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="absolute right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full z-10 cursor-pointer transition-colors"
                  title="Clear date filter"
                  type="button"
                >
                  <X className="w-3.5 h-3.5 text-slate-500 hover:text-red-500 transition-colors" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid - Dynamic based on View Mode */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {viewMode === 'active' ? (
            <>
              <StatCard
                label="Pending"
                count={baseFilteredOrders.filter(o => o.status === 'pending').length}
                color="yellow"
                icon={<Clock className="w-5 h-5" />}
                onClick={() => setSelectedStatus(selectedStatus === 'pending' ? 'all' : 'pending')}
                isActive={selectedStatus === 'pending'}
              />
              <StatCard
                label="Preparing"
                count={baseFilteredOrders.filter(o => o.status === 'preparing').length}
                color="blue"
                icon={<AlertCircle className="w-5 h-5" />}
                onClick={() => setSelectedStatus(selectedStatus === 'preparing' ? 'all' : 'preparing')}
                isActive={selectedStatus === 'preparing'}
              />
              <StatCard
                label="Ready"
                count={baseFilteredOrders.filter(o => o.status === 'ready').length}
                color="emerald"
                icon={<CheckCircle className="w-5 h-5" />}
                onClick={() => setSelectedStatus(selectedStatus === 'ready' ? 'all' : 'ready')}
                isActive={selectedStatus === 'ready'}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Served"
                count={baseFilteredOrders.filter(o => o.status === 'served').length}
                color="emerald"
                icon={<CheckCircle className="w-5 h-5" />}
                onClick={() => setSelectedStatus(selectedStatus === 'served' ? 'all' : 'served')}
                isActive={selectedStatus === 'served'}
              />
              <StatCard
                label="Cancelled"
                count={baseFilteredOrders.filter(o => o.status === 'cancelled').length}
                color="rose"
                icon={<X className="w-5 h-5" />}
                onClick={() => setSelectedStatus(selectedStatus === 'cancelled' ? 'all' : 'cancelled')}
                isActive={selectedStatus === 'cancelled'}
              />
              <StatCard
                label="Total Orders"
                count={baseFilteredOrders.filter(o => ['served', 'cancelled'].includes(o.status)).length}
                color="blue"
                icon={<History className="w-5 h-5" />}
                onClick={() => setSelectedStatus('all')}
                isActive={selectedStatus === 'all'}
              />
            </>
          )}

          <StatCard
            label="Total Sales"
            value={`$${displayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(2)}`}
            color="indigo"
            icon={<DollarSign className="w-5 h-5" />}
          />
        </div>
      </div>

      {/* --- Orders List --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {displayOrders && displayOrders.length > 0 ? (
          displayOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusClick={handleStatusClick}
              onCancelClick={handleCancelClick}
              onViewDetails={() => {
                setSelectedOrder(order);
                setShowDetailsModal(true);
              }}
            />
          ))
        ) : (
          <div className="col-span-full text-center py-24 bg-white/50 dark:bg-slate-800/50 rounded-3xl border border-slate-200/50 dark:border-slate-700/50 border-dashed backdrop-blur-sm">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Search className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">No {viewMode} orders found</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {viewMode === 'active'
                ? "New orders will appear here when placed."
                : "No past orders found for this date."}
            </p>
          </div>
        )}
      </div>

      {/* --- Modals --- */}

      {/* 1. Confirmation Modal */}
      {showConfirmModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-sm p-8 animate-scale-in text-center border border-slate-100 dark:border-slate-700">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${actionType === 'cancel' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              }`}>
              {actionType === 'cancel' ? <AlertTriangle className="w-8 h-8" /> : <CheckCircle className="w-8 h-8" />}
            </div>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {actionType === 'cancel' ? 'Cancel Order?' : 'Update Status?'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              {actionType === 'cancel'
                ? `Are you sure you want to cancel Order #${selectedOrder.order_number || selectedOrder.id}? This action cannot be undone.`
                : `Are you sure you want to mark Order #${selectedOrder.order_number || selectedOrder.id} as ${targetStatus?.replace('_', ' ')}?`
              }
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-3.5 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={confirmAction}
                className={`flex-1 px-4 py-3.5 rounded-xl font-bold text-white shadow-lg shadow-opacity-20 transition-all active:scale-95 hover:-translate-y-0.5 ${actionType === 'cancel'
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
                  }`}
              >
                {actionType === 'cancel' ? 'Yes, Cancel' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Order Details Modal */}
      {showDetailsModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-700">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-xl">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Order Details
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    #{selectedOrder.order_number || selectedOrder.id}
                  </p>
                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Table {selectedOrder.tableNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Status Badge */}
              <div className="mb-8 text-center">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border shadow-sm ${getStatusStyles(selectedOrder.status)}`}>
                  {selectedOrder.status === 'pending' && <Clock className="w-4 h-4" />}
                  {selectedOrder.status === 'preparing' && <AlertCircle className="w-4 h-4" />}
                  {selectedOrder.status === 'ready' && <CheckCircle className="w-4 h-4" />}
                  {selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1)}
                </span>
                <p className="text-xs text-slate-400 mt-2 font-medium uppercase tracking-wider">
                  {new Date(selectedOrder.timestamp).toLocaleString()}
                </p>
              </div>

              {/* Items List */}
              <div className="space-y-1 mb-8">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Items Ordered
                </h4>
                {(selectedOrder.items || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-50 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="flex gap-4 items-center">
                      <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm shrink-0">
                        {item.quantity}x
                      </div>
                      <div>
                        <p className="text-slate-900 dark:text-white font-bold text-sm">
                          {item.name}
                        </p>
                      </div>
                    </div>
                    <span className="text-slate-600 dark:text-slate-300 font-medium text-sm">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 space-y-3 border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between text-sm font-medium text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>${Number(selectedOrder.total).toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between font-bold text-xl text-slate-900 dark:text-white mt-2">
                  <span>Total</span>
                  <span>${Number(selectedOrder.total).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-sm">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-components ---

const StatCard = ({ label, count, value, color, icon, onClick, isActive }: {
  label: string;
  count?: number;
  value?: string;
  color: 'yellow' | 'blue' | 'emerald' | 'indigo' | 'rose';
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
}) => {
  const colorStyles = {
    yellow: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-100 dark:border-amber-800/30 text-amber-700 dark:text-amber-400',
    blue: 'from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-400',
    emerald: 'from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400',
    indigo: 'from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 border-indigo-100 dark:border-indigo-800/30 text-indigo-700 dark:text-indigo-400',
    rose: 'from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 border-rose-100 dark:border-rose-800/30 text-rose-700 dark:text-rose-400',
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden p-5 rounded-2xl border bg-gradient-to-br ${colorStyles[color]} shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group ${isActive ? 'ring-2 ring-offset-2 ring-emerald-500 dark:ring-offset-slate-900 scale-[1.02]' : 'hover:-translate-y-1'
        }`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 dark:bg-white/5 rounded-full blur-2xl -mr-6 -mt-6 transition-transform group-hover:scale-150 duration-500"></div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider opacity-90">{label}</span>
          <div className={`p-2 rounded-xl bg-white/60 dark:bg-black/20 backdrop-blur-sm shadow-sm group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight">
          {value || count}
        </div>
      </div>
    </div>
  );
};

const OrderCard = ({ order, onStatusClick, onCancelClick, onViewDetails }: {
  order: Order;
  onStatusClick: (order: Order, status: Order['status']) => void;
  onCancelClick: (order: Order) => void;
  onViewDetails: () => void;
}) => {
  const getNextStatus = (s: Order['status']): Order['status'] =>
    s === 'pending' ? 'preparing' :
      s === 'preparing' ? 'ready' :
        s === 'ready' ? 'served' : s;

  const nextStatus = getNextStatus(order.status);
  const canAdvance = order.status !== 'served' && order.status !== 'cancelled';
  const isTakeAway = order.type === 'take_away';

  return (
    <div className="group relative bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 p-1 overflow-visible hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div className="p-6 flex flex-col h-full bg-white dark:bg-slate-800 rounded-[1.8rem]">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg mb-2 ${isTakeAway
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                {isTakeAway ? <LayoutList className="w-7 h-7" /> : (order.tableNumber?.replace(/\D/g, '') || 'N/A')}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isTakeAway ? 'Takeaway' : 'Table'}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Order #{order.order_number || order.id}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getStatusStyles(order.status)}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {(() => {
                    try {
                      return new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {
                      return '--:--';
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-slate-100 dark:bg-slate-700/50 mb-4"></div>

        {/* Total Price */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {order.items?.length || 0} Items
          </span>
          <span className="text-2xl font-bold text-slate-900 dark:text-white">
            ${Number(order.total).toFixed(2)}
          </span>
        </div>

        {/* Actions Footer */}
        <div className="mt-auto pt-4 flex flex-col gap-3">
          {/* Main Action Button */}
          <div className="flex gap-3">
            <button
              onClick={onViewDetails}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Details
            </button>

            {canAdvance && (
              <button
                onClick={() => onStatusClick(order, nextStatus)}
                className="flex-[2] py-3 px-4 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-emerald-50 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group/btn"
              >
                <span>Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}</span>
                <ArrowRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
              </button>
            )}
          </div>

          {/* Cancel Button (Text only for subtle look) */}
          {(order.status === 'pending' || order.status === 'preparing') && (
            <button
              onClick={() => onCancelClick(order)}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 py-2 transition-colors uppercase tracking-widest"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const getStatusStyles = (status: Order['status']) => {
  switch (status) {
    case 'pending': return 'bg-amber-100/50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50';
    case 'preparing': return 'bg-blue-100/50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/50';
    case 'ready': return 'bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/50';
    case 'served': return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600 grayscale';
    case 'cancelled': return 'bg-rose-100/50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700/50';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

export default OrderManagement;

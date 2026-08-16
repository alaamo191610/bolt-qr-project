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
  MessageSquareText,
  SlidersHorizontal,
  Utensils,
  X
} from 'lucide-react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { getErrorMessage } from '../../utils/errors';

// --- Types ---
interface CustomizationDetails {
  ingredients?: Array<{ name_en?: string; action?: string; qty?: number }>;
  options?: Array<{ name_en?: string; qty?: number }>;
  comboChildren?: Array<{ name_en?: string }>;
}

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  note?: string | null;
  customizationDetails?: CustomizationDetails;
}

export interface Order {
  id: number;
  order_number?: number;
  tableNumber: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  timestamp: Date | string;
  type?: 'dine_in' | 'take_away';
}

interface OrderManagementProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  onStatusChange?: (orderId: number, newStatus: Order['status']) => void | Promise<void>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onViewModeChange?: (mode: 'active' | 'history') => void;
}

// --- Components ---

const OrderManagement: React.FC<OrderManagementProps> = ({
  orders,
  setOrders,
  onStatusChange,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onViewModeChange,
}) => {
  const { formatPrice } = useCurrency();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionType, setActionType] = useState<'status_change' | 'cancel' | null>(null);
  const [targetStatus, setTargetStatus] = useState<Order['status'] | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | 'all'>('all');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [failedOrderIds, setFailedOrderIds] = useState<Set<number>>(new Set());

  // --- Filtering Logic ---
  const baseFilteredOrders = useMemo(() => {
    return (orders || []).filter(order => {
      if (!order) return false;

      let matchesDate = true;
      if (selectedDate) {
        try {
          const orderDate = new Date(order.timestamp).toLocaleDateString('en-CA');
          matchesDate = orderDate === selectedDate;
        } catch {
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
    onViewModeChange?.(mode);
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

  const confirmAction = async () => {
    if (!selectedOrder || !targetStatus) return;

    const { id: orderId } = selectedOrder;
    const previousStatus = selectedOrder.status;

    // Optimistic update
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: targetStatus } : o))
    );
    setFailedOrderIds(prev => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    setShowConfirmModal(false);
    setSelectedOrder(null);
    setTargetStatus(null);
    setActionType(null);

    if (!onStatusChange) return;

    setIsSavingStatus(true);
    try {
      await onStatusChange(orderId, targetStatus);
    } catch (error) {
      console.error('Failed to update order status:', getErrorMessage(error));
      // Revert the optimistic update; the caller is responsible for its own
      // user-facing error message (e.g. a toast), this just undoes the guess.
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: previousStatus } : o))
      );
      setFailedOrderIds(prev => new Set(prev).add(orderId));
    } finally {
      setIsSavingStatus(false);
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
                aria-label="Filter by date"
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
            value={formatPrice(displayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0))}
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
              formatPrice={formatPrice}
              onViewDetails={() => {
                setSelectedOrder(order);
                setShowDetailsModal(true);
              }}
              isSaving={isSavingStatus && selectedOrder?.id === order.id}
              updateFailed={failedOrderIds.has(order.id)}
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

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void onLoadMore()}
            disabled={loadingMore}
            className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {loadingMore ? 'Loading orders…' : 'Load more orders'}
          </button>
        </div>
      )}

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
                  : 'bg-[var(--color-primary)] hover:bg-[var(--color-secondary)]'
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
                aria-label="Close"
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium uppercase tracking-wider">
                  {new Date(selectedOrder.timestamp).toLocaleString()}
                </p>
              </div>

              {/* Items List */}
              <div className="space-y-1 mb-8">
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                  Items Ordered
                </h4>
                {(selectedOrder.items || []).map((item, idx) => (
                  <OrderItemDetails key={idx} item={item} formatPrice={formatPrice} spacious />
                ))}
              </div>

              {/* Summary */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 space-y-3 border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between text-sm font-medium text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(Number(selectedOrder.total))}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between font-bold text-xl text-slate-900 dark:text-white mt-2">
                  <span>Total</span>
                  <span>{formatPrice(Number(selectedOrder.total))}</span>
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

const OrderCard = ({ order, onStatusClick, onCancelClick, onViewDetails, formatPrice, isSaving, updateFailed }: {
  order: Order;
  onStatusClick: (order: Order, status: Order['status']) => void;
  onCancelClick: (order: Order) => void;
  onViewDetails: () => void;
  formatPrice: (amount: number, useSymbol?: boolean) => string;
  isSaving?: boolean;
  updateFailed?: boolean;
}) => {
  const getNextStatus = (s: Order['status']): Order['status'] =>
    s === 'pending' ? 'preparing' :
      s === 'preparing' ? 'ready' :
        s === 'ready' ? 'served' : s;

  const nextStatus = getNextStatus(order.status);
  const canAdvance = order.status !== 'served' && order.status !== 'cancelled';
  const isTakeAway = order.type === 'take_away';
  const itemCount = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const hasNotes = (order.items || []).some(item => item.note?.trim());

  return (
    <div className={`group relative bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border p-1 overflow-visible hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${updateFailed
      ? 'border-rose-300 dark:border-rose-700 ring-2 ring-rose-500/20'
      : 'border-slate-200 dark:border-slate-700'
      }`}>
      <div className="p-5 flex flex-col h-full bg-white dark:bg-slate-800 rounded-[1.8rem]">
        {updateFailed && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/20 px-3 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">Status update failed. Order was not changed, please try again.</span>
          </div>
        )}
        <div className="flex justify-between items-start gap-4 mb-5">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-sm mb-1.5 ${isTakeAway
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                {isTakeAway ? <LayoutList className="w-6 h-6" /> : (order.tableNumber?.replace(/\D/g, '') || 'N/A')}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isTakeAway ? 'Takeaway' : 'Table'}
              </span>
            </div>

            <div className="min-w-0">
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
                    } catch {
                      return '--:--';
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-y border-slate-100 dark:border-slate-700/60 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Order items</span>
              <span className="inline-flex min-w-6 h-6 px-1.5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                {itemCount}
              </span>
            </div>
            {hasNotes && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                <MessageSquareText className="w-3.5 h-3.5" /> Notes
              </span>
            )}
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
            {(order.items || []).map((item, idx) => (
              <OrderItemDetails key={idx} item={item} formatPrice={formatPrice} />
            ))}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="mt-auto pt-5 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Order total</span>
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {formatPrice(Number(order.total))}
            </span>
          </div>
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
                disabled={isSaving}
                className="flex-[2] py-3 px-4 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-emerald-50 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group/btn disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-lg"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}</span>
                    <ArrowRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Cancel Button (Text only for subtle look) */}
          {(order.status === 'pending' || order.status === 'preparing') && (
            <button
              onClick={() => onCancelClick(order)}
              className="text-xs font-bold text-rose-700 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 py-2 transition-colors uppercase tracking-widest"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const OrderItemDetails = ({ item, formatPrice, spacious = false }: {
  item: OrderItem;
  formatPrice: (amount: number, useSymbol?: boolean) => string;
  spacious?: boolean;
}) => {
  const customizations = getCustomizationLabels(item);

  return (
    <div className={`${spacious ? 'py-4' : 'py-3'} border-b border-slate-100 dark:border-slate-700/50 last:border-0`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="inline-flex min-w-8 h-8 px-1.5 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-extrabold text-slate-700 dark:text-slate-200 shrink-0">
            {item.quantity}x
          </span>
          <div className="min-w-0 pt-1">
            <p className="font-bold text-sm leading-5 text-slate-900 dark:text-white break-words">{item.name}</p>
            {customizations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customizations.map((label, index) => (
                  <span key={`${label}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/25 px-2 py-1 text-[11px] font-semibold leading-4 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/50">
                    <SlidersHorizontal className="w-3 h-3 shrink-0" /> {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap pt-1">
          {formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 0))}
        </span>
      </div>
      {item.note?.trim() && (
        <div className="mt-3 ml-11 flex items-start gap-2 rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs leading-5 text-amber-900 dark:text-amber-200">
          <MessageSquareText className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-extrabold">Note: </span>
            <span className="whitespace-pre-wrap break-words">{item.note}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const getCustomizationLabels = (item: OrderItem): string[] => {
  const details = item.customizationDetails;
  if (!details) return [];

  const ingredients = (details.ingredients || []).map(ingredient => {
    const name = ingredient.name_en || 'Ingredient';
    const quantity = Number(ingredient.qty) > 1 ? ` x${ingredient.qty}` : '';
    if (ingredient.action === 'remove') return `No ${name}`;
    if (ingredient.action === 'extra') return `Extra ${name}${quantity}`;
    return `${name}${quantity}`;
  });
  const options = (details.options || []).map(option =>
    `${option.name_en || 'Option'}${Number(option.qty) > 1 ? ` x${option.qty}` : ''}`
  );
  const comboChildren = (details.comboChildren || []).map(child => child.name_en || 'Combo item');

  return [...ingredients, ...options, ...comboChildren];
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

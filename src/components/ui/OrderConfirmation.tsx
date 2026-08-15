import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Clock, CheckCircle2, PartyPopper, ArrowRight, UtensilsCrossed, TimerReset, WifiOff } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { socket, joinOrderRoom } from '../../services/socket';
import { orderService } from '../../services/orderService';
import { isUnauthenticatedError } from '../../services/api';
import { isNewerOrderEvent, type OrderRealtimeEvent } from '../../services/orderRealtime';

interface ConfirmedOrder {
  id: number;
  status: string;
  version?: number;
  updated_at?: string;
  order_number?: number;
  total?: number | string;
  tracking_token?: string;
  table?: { code?: string } | null;
}

interface Props {
  order: ConfirmedOrder;
  onStartNewOrder: () => void;
  onOrderChange?: (order: ConfirmedOrder) => void;
}

const EMOJIS = ['🍔', '🍕', '🍟', '🥗', '🍰', '🥤', '🌮', '🍣', '🍗', '🧁', '🥞', '🍩'];

const OrderConfirmation: React.FC<Props> = ({ order: initialOrder, onStartNewOrder, onOrderChange }) => {
  const { t, isRTL } = useLanguage();
  const [order, setOrder] = useState(initialOrder);
  const [isTrackingExpired, setIsTrackingExpired] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const onOrderChangeRef = useRef(onOrderChange);
  const initialOrderRef = useRef(initialOrder);
  const currentVersionRef = useRef(initialOrder.version ?? 0);
  initialOrderRef.current = initialOrder;
  const orderId = initialOrder.id;
  const trackingToken = initialOrder.tracking_token;

  useEffect(() => {
    onOrderChangeRef.current = onOrderChange;
  }, [onOrderChange]);

  // Status mapping
  const STATUS_STEPS = [
    { key: 'pending', label: t('status.pending'), icon: Clock },
    { key: 'preparing', label: t('status.preparing'), icon: UtensilsCrossed },
    { key: 'ready', label: t('status.ready'), icon: CheckCircle2 },
    { key: 'served', label: t('status.served'), icon: PartyPopper }
  ];

  useEffect(() => {
    setOrder(initialOrder);
    currentVersionRef.current = initialOrder.version ?? currentVersionRef.current;
  }, [initialOrder]);

  // Mobile browsers suspend sockets and can reload discarded tabs. Rejoin and
  // reconcile with the server whenever the connection/page becomes active.
  useEffect(() => {
    if (!orderId || !trackingToken) return;
    let expired = false;

    const applyStatus = (status: string, version: number, updatedAt?: string) => {
      currentVersionRef.current = version;
      const updated = {
        ...initialOrderRef.current,
        status,
        version,
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      };
      setOrder(updated);
      onOrderChangeRef.current?.(updated);
    };
    const refreshStatus = async () => {
      if (expired) return;
      try {
        const latest = await orderService.getPublicOrderStatus(orderId, trackingToken);
        if (latest.version >= currentVersionRef.current) {
          applyStatus(latest.status, latest.version, latest.updated_at);
        }
      } catch (error) {
        if (isUnauthenticatedError(error)) {
          // The tracking token expired server-side; stop retrying with a
          // dead token and let the customer know instead of silently
          // freezing on the last known status forever.
          expired = true;
          setIsTrackingExpired(true);
          return;
        }
        console.warn('Unable to refresh order status:', error);
      }
    };
    const joinAndRefresh = () => {
      if (expired) return;
      setIsReconnecting(false);
      joinOrderRoom(orderId, trackingToken);
      void refreshStatus();
    };
    const handleUpdate = (event: OrderRealtimeEvent) => {
      if (!isNewerOrderEvent(event, { orderId, currentVersion: currentVersionRef.current })) return;
      applyStatus(event.order.status, event.order.version, event.order.updated_at);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      else joinAndRefresh();
    };
    const handleDisconnect = () => {
      if (expired) return;
      setIsReconnecting(true);
    };
    // socket.io's own reconnection backoff can lag noticeably behind the OS
    // actually reporting connectivity back - force an immediate attempt
    // rather than waiting it out.
    const handleOnline = () => {
      if (expired) return;
      if (!socket.connected) socket.connect();
      else joinAndRefresh();
    };

    socket.on('connect', joinAndRefresh);
    socket.on('disconnect', handleDisconnect);
    socket.on('order.status.v1', handleUpdate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', joinAndRefresh);
    window.addEventListener('online', handleOnline);

    if (socket.connected) joinAndRefresh();
    else socket.connect();

    return () => {
      socket.off('connect', joinAndRefresh);
      socket.off('disconnect', handleDisconnect);
      socket.off('order.status.v1', handleUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', joinAndRefresh);
      window.removeEventListener('online', handleOnline);
    };
  }, [orderId, trackingToken]);

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);
  const activeStepIndex = currentStepIndex === -1 ? 0 : currentStepIndex;

  const confetti = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i, emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    left: Math.random() * 100, delay: Math.random() * 800, duration: 1600 + Math.random() * 800
  })), []);

  if (isTrackingExpired) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4" role="alert">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <TimerReset className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t('status.trackingExpired')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8">
            {t('status.trackingExpiredDescription')}
          </p>
          <button
            onClick={onStartNewOrder}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>{t('menu.startNewOrder')}</span>
            <ArrowRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Confetti only on initial load or completed */}
      {order.status === 'served' && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          {confetti.map(item => (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                left: `${item.left}%`,
                top: '-10%',
                animation: `drop ${item.duration}ms ease-in ${item.delay}ms forwards`
              }}
              className="text-2xl"
            >
              {item.emoji}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-short">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t('menu.orderPlaced')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {t('menu.orderPlacedDescription', { table: order.table?.code || '...' })}
          </p>
          <p className="text-sm text-slate-400 mt-2 font-mono">
            Order #{order.id}
          </p>
          {isReconnecting && (
            <div
              role="status"
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium"
            >
              <WifiOff className="w-3.5 h-3.5 animate-pulse" />
              {t('status.reconnecting')}
            </div>
          )}
        </div>

        {/* Status Stepper */}
        <div className="space-y-6 mb-8 relative">
          <div className={`absolute left-4 top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-700 ${isRTL ? 'right-4 left-auto' : ''}`} />

          {STATUS_STEPS.map((step, idx) => {
            const isActive = idx === activeStepIndex;
            const isCompleted = idx < activeStepIndex;
            const Icon = step.icon;

            return (
              <div key={step.key} className={`relative flex items-center gap-4 ${isActive ? 'scale-105' : 'opacity-60'} transition-all duration-300`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 transition-colors duration-300 ${isActive || isCompleted
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                  }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                    {step.label}
                  </h3>
                  {isActive && (
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 animate-pulse">
                      {t('status.current')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onStartNewOrder}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>{t('menu.startNewOrder')}</span>
            <ArrowRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={onStartNewOrder}
            className="w-full py-3.5 px-4 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium transition-colors"
          >
            {t('menu.addMoreItems')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes drop {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
        .animate-bounce-short {
            animation: bounce-short 1s infinite;
        }
        @keyframes bounce-short {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10%); }
        }
      `}</style>
    </div>
  );
};

export default OrderConfirmation;

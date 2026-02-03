import React, { useMemo, useEffect, useState } from 'react';
import { Clock, CheckCircle2, Circle, PartyPopper, ArrowRight, UtensilsCrossed } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { socket, joinOrderRoom } from '../../services/socket';

interface Props {
  order: any;
  onStartNewOrder: () => void;
}

const EMOJIS = ['🍔', '🍕', '🍟', '🥗', '🍰', '🥤', '🌮', '🍣', '🍗', '🧁', '🥞', '🍩'];

const OrderConfirmation: React.FC<Props> = ({ order: initialOrder, onStartNewOrder }) => {
  const { t, isRTL } = useLanguage();
  const [order, setOrder] = useState(initialOrder);

  // Status mapping
  const STATUS_STEPS = [
    { key: 'pending', label: t('status.pending'), icon: Clock },
    { key: 'preparing', label: t('status.preparing'), icon: UtensilsCrossed },
    { key: 'ready', label: t('status.ready'), icon: CheckCircle2 },
    { key: 'served', label: t('status.served'), icon: PartyPopper }
  ];

  // Join socket room
  useEffect(() => {
    if (order?.id) {
      console.log('Joining order room:', order.id);
      joinOrderRoom(order.id);

      const handleUpdate = (data: { status: string }) => {
        console.log('Order update received:', data);
        setOrder((prev: any) => ({ ...prev, status: data.status }));
      };

      socket.on('order-status-updated', handleUpdate);
      return () => {
        socket.off('order-status-updated', handleUpdate);
      };
    }
  }, [order?.id]);

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);
  const activeStepIndex = currentStepIndex === -1 ? 0 : currentStepIndex;

  const confetti = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i, emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    left: Math.random() * 100, delay: Math.random() * 800, duration: 1600 + Math.random() * 800
  })), []);

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

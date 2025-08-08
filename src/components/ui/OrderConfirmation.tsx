import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props { tableNumber: string; }

const EMOJIS = ['🍔','🍕','🍟','🥗','🍰','🥤','🌮','🍣','🍗','🧁','🥞','🍩'];

const OrderConfirmation: React.FC<Props> = ({ tableNumber }) => {
  const { t, isRTL } = useLanguage();
  const confetti = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i, emoji: EMOJIS[Math.floor(Math.random()*EMOJIS.length)],
    left: Math.random()*100, delay: Math.random()*800, duration: 1600 + Math.random()*800
  })), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900 dark:to-green-900 flex items-center justify-center p-4">
      {/* Confetti */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
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

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center max-w-md w-full relative">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✅</span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {t('menu.orderPlaced')}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          {t('menu.orderPlacedDescription', { table: tableNumber })}
        </p>

        <div className={`flex items-center justify-center space-x-2 ${isRTL ? 'space-x-reverse' : ''} text-sm text-slate-500 dark:text-slate-400`}>
          <Clock className="w-4 h-4" />
          <span>{t('menu.estimatedTime')}</span>
        </div>
      </div>

      <style>{`
        @keyframes drop {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default OrderConfirmation;
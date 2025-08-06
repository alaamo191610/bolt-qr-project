import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface Props {
  itemCount: number;
  isRTL: boolean;
  onClick: () => void;
}

const FloatingCartButton: React.FC<Props> = ({ itemCount, isRTL, onClick }) => {
  if (itemCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 ${isRTL ? 'left-6' : 'right-6'} bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-40 animate-pulse-slow`}
    >
      <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
        <ShoppingCart className="w-5 h-5" />
        <span className="font-medium bg-white text-emerald-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">
          {itemCount}
        </span>
      </div>
    </button>
  );
};

export default FloatingCartButton;
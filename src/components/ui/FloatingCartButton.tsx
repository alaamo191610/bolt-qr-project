import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface Props {
  itemCount: number;
  isRTL: boolean;
  onClick: () => void;
}

const FloatingCartButton: React.FC<Props> = ({ itemCount, isRTL, onClick }) => {
  // Always keep an anchor in the DOM for the fly-to-cart animation
  if (itemCount === 0) {
    return (
      <div
        id="floating-cart-anchor"
        data-cart-anchor="floating"
        style={{
          position: 'fixed',
          bottom: '8px',
          ...(isRTL ? { left: '8px' } : { right: '8px' }),
          width: '1px',
          height: '1px',
          pointerEvents: 'none',
          opacity: '0',
          zIndex: 1,
        }}
      />
    );
  }

  return (
    <button
      id="floating-cart-anchor"
      data-cart-anchor="floating"
      onClick={onClick}
      className={`fixed bottom-6 ${isRTL ? 'left-6' : 'right-6'} bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-40`}
      style={{ transformOrigin: 'center' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).animate(
          [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-6deg)' },
            { transform: 'rotate(3deg)' },
            { transform: 'rotate(0deg)' },
          ],
          { duration: 450 }
        );
      }}
      aria-label="Open cart"
    >
      <div className={`relative flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
        <div className="relative">
          <ShoppingCart className="w-5 h-5" />
          {/* tiny ping */}
          <span className="absolute -top-2 -right-2 inline-flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white opacity-80" />
          </span>
        </div>
        <span className="font-medium bg-white text-emerald-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">
          {itemCount}
        </span>
      </div>
    </button>
  );
};

export default FloatingCartButton;

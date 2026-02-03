import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import MenuItemCustomizer, {
  type CartLine,
} from "../ui/MenuItemCustomizer";

/**
 * CustomerItemModal (Portal)
 *
 * Renders the menu customizer in a real modal overlay using a React Portal
 * to <body>. This avoids layout containers (overflow/transform) clipping a
 * "fixed" overlay, which is why you were seeing it render inside the card.
 */

export default function CustomerItemModal({
  menuId,
  isOpen,
  onClose,
  onAddToCart,
}: {
  menuId: string;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (line: CartLine) => void;
}) {
  // Avoid SSR/hydration issues and lock scroll while open
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [isOpen, mounted, onClose]);

  if (!isOpen || !mounted || typeof window === "undefined") return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative h-[90vh] w-full sm:max-w-xl sm:rounded-2xl bg-white overflow-auto dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItemCustomizer
          menuId={menuId}
          defaultQuantity={1}
          onAdd={(line) => {
            onAddToCart(line);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

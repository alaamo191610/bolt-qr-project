// Popover.tsx
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  anchorEl: HTMLElement | null;  // the header cart button
  isRTL?: boolean;
  children: React.ReactNode;
};

export function HeaderCartPopover({ open, anchorEl, isRTL, children }: Props) {
  const [pos, setPos] = useState<{top:number; left:number}>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;

    const update = () => {
      const r = anchorEl.getBoundingClientRect();
      const gap = 10;                // space between anchor and popover
      const width = 340;             // your panel width
      const top = r.bottom + gap;
      const left = isRTL
        ? Math.max(8, r.left - (width - 24)) // align arrow approx. under icon
        : Math.min(window.innerWidth - width - 8, r.right - (width - 24));

      setPos({ top, left });
    };

    const rafUpdate = () => requestAnimationFrame(update);
    update();

    window.addEventListener("scroll", rafUpdate, { passive: true });
    window.addEventListener("resize", rafUpdate);
    return () => {
      window.removeEventListener("scroll", rafUpdate);
      window.removeEventListener("resize", rafUpdate);
    };
  }, [open, anchorEl, isRTL]);

  if (!open) return null;

  return createPortal(
    <div
      id="header-cart-popover"
      className="fixed z-[60] animate-scale-in"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="Mini cart"
    >
      {children}
    </div>,
    document.body
  );
}
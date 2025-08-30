// src/components/admin/ui/CollapsiblePanelCard.tsx
'use client';

import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type Props = React.PropsWithChildren<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;          // will show only when open (by default)
  defaultOpen?: boolean;              // start open or closed
  storageKey?: string;                // remember last state in localStorage
  className?: string;
  showActionsWhenClosed?: boolean;    // set true if you want actions always visible
}>;

export default function CollapsiblePanelCard({
  title,
  description,
  actions,
  children,
  defaultOpen = false,
  storageKey,
  className = '',
  showActionsWhenClosed = false,
}: Props) {
  const id = useId();
  const panelId = `${id}-panel`;

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !storageKey) return defaultOpen;
    const v = localStorage.getItem(storageKey);
    return v === null ? defaultOpen : v === '1';
  });

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, open ? '1' : '0');
  }, [open, storageKey]);

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between p-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex items-start gap-3 text-left w-full group"
        >
          <span className="mt-0.5 w-6 h-6 grid place-items-center rounded-md bg-emerald-50 text-emerald-700">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {description && <p className="text-slate-600">{description}</p>}
          </div>
        </button>

        {(open || showActionsWhenClosed) && actions && (
          <div className="ml-4 shrink-0">{actions}</div>
        )}
      </div>

      {/* Animated body (mounted always, just height-animated) */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out px-6 pb-6 ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

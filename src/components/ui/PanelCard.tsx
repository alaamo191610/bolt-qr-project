// components/admin/ui/PanelCard.tsx
import React from 'react';

export default function PanelCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description && <p className="text-slate-600">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
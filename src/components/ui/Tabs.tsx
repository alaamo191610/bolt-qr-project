// src/components/admin/ui/Tabs.tsx
'use client';

import React, {
  createContext, useContext, useEffect, useId,
  useMemo, useRef, useState
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type TabsCtx = {
  active: string;
  setActive: (v: string) => void;
  idBase: string;
};
const Ctx = createContext<TabsCtx | null>(null);

export function Tabs({
  defaultValue,
  storageKey,
  queryKey = 'tab',
  urlSync = true,
  rtl = false,
  children,
}: {
  defaultValue: string;
  storageKey?: string;   // e.g. 'admin-settings-tab'
  queryKey?: string;     // e.g. 'tab'
  urlSync?: boolean;     // update URL ?tab=...
  rtl?: boolean;
  children: React.ReactNode;
}) {
  const idBase = useId();
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const fromUrl = params.get(queryKey) || '';
  const fromStorage =
    storageKey && typeof window !== 'undefined' ? localStorage.getItem(storageKey) || '' : '';
  const initial = fromUrl || fromStorage || defaultValue;

  const [active, setActiveState] = useState(initial);

  const setActive = (v: string) => {
    setActiveState(v);
    if (storageKey && typeof window !== 'undefined') localStorage.setItem(storageKey, v);
    if (urlSync) {
      const next = new URLSearchParams(location.search);
      next.set(queryKey, v);
      navigate({ pathname: location.pathname, search: `?${next.toString()}` }, { replace: true });
    }
  };

  useEffect(() => {
    if (!urlSync) return;
    const current = new URLSearchParams(location.search).get(queryKey);
    if (current && current !== active) setActiveState(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const value = useMemo(() => ({ active, setActive, idBase }), [active, idBase]);

  return (
    <Ctx.Provider value={value}>
      <div className={rtl ? 'rtl' : ''} dir={rtl ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function TabList({ children }: { children: React.ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    if (!items || items.length === 0) return;
    const current = Array.from(items).findIndex((el) => el.getAttribute('aria-selected') === 'true');
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    const next = (current + dir + items.length) % items.length;
    items[next].focus();
    (items[next] as HTMLButtonElement).click();
  };

  return (
    <div
      role="tablist"
      ref={listRef}
      onKeyDown={onKeyDown}
      className="inline-flex w-full gap-2 rounded-xl border bg-white p-1 overflow-x-auto scrollbar-hide"
    >
      {children}
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(Ctx)!;
  const selected = ctx.active === value;
  const tabId = `${ctx.idBase}-tab-${value}`;
  const panelId = `${ctx.idBase}-panel-${value}`;

  return (
    <button
      id={tabId}
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={() => ctx.setActive(value)}
      className={`flex-none md:flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition
        ${selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  );
}

export function TabPanels({ children }: { children: React.ReactNode }) {
  return <div className="mt-4">{children}</div>;
}

export function TabPanel({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(Ctx)!;
  const selected = ctx.active === value;
  const panelId = `${ctx.idBase}-panel-${value}`;
  const tabId = `${ctx.idBase}-tab-${value}`;
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} hidden={!selected} className="focus:outline-none">
      {selected ? children : null}
    </div>
  );
}
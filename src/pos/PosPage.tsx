import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Banknote, Delete, LogOut, Minus, Plus, Printer, ReceiptText, Search, ShoppingBag, Trash2, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { posService } from './service';
import type { PosBootstrap, PosCheck, PosEmployee, PosMenuItem, PosMenuOptions, PosReceipt } from './types';

const money = (value: number | string, currency = 'JOD') => new Intl.NumberFormat('en-JO', {
  style: 'currency', currency, minimumFractionDigits: currency === 'JOD' ? 3 : 2,
}).format(Number(value || 0));

export default function PosPage() {
  const branchId = new URLSearchParams(window.location.search).get('branch') || localStorage.getItem('pos_branch_id') || '';
  const [employees, setEmployees] = useState<PosEmployee[]>([]);
  const [branchName, setBranchName] = useState('Point of Sale');
  const [employee, setEmployee] = useState<PosEmployee | null>(null);
  const [pin, setPin] = useState('');
  const [data, setData] = useState<PosBootstrap | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [check, setCheck] = useState<PosCheck | null>(null);
  const [customizer, setCustomizer] = useState<PosMenuOptions | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<number[]>([]);
  const [removedIngredients, setRemovedIngredients] = useState<number[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  const loadBootstrap = useCallback(async () => {
    const next = await posService.bootstrap();
    setData(next);
    setBranchName(next.branch.name);
  }, []);

  useEffect(() => {
    if (!branchId) return;
    localStorage.setItem('pos_branch_id', branchId);
    if (posService.hasSession()) {
      loadBootstrap().catch(() => posService.logout());
      return;
    }
    posService.getAccess(branchId).then(access => {
      setEmployees(access.employees);
      setBranchName(access.branch.name);
    }).catch(error => toast.error(error.message));
  }, [branchId, loadBootstrap]);

  const visibleMenus = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    return data.menus.filter(item =>
      (activeCategory === null || item.category_id === activeCategory) &&
      (!normalized || item.name_en.toLowerCase().includes(normalized) || item.name_ar?.includes(normalized)),
    );
  }, [activeCategory, data, query]);

  const cartItems = useMemo(() => check?.orders?.flatMap(order => order.order_items).filter(item => item.status === 'ACTIVE') || [], [check]);

  const signIn = async () => {
    if (!employee || pin.length < 4) return;
    setBusy(true);
    try {
      await posService.login(branchId, employee.id, pin);
      await loadBootstrap();
      setPin('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign in failed');
      setPin('');
    } finally { setBusy(false); }
  };

  const openShift = async (registerId: string) => {
    setBusy(true);
    try {
      await posService.openShift(registerId, 0);
      await loadBootstrap();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not open shift'); }
    finally { setBusy(false); }
  };

  const addItem = async (menuId: number, options: { modifierOptionIds?: number[]; removedIngredientIds?: number[] } = {}, allowWhileLoading = false) => {
    if (busy && !allowWhileLoading) return;
    setBusy(true);
    try {
      const current = check || await posService.createCheck();
      setCheck(await posService.addItem(current.id, menuId, current.version, options));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add item'); }
    finally { setBusy(false); }
  };

  const selectMenuItem = async (item: PosMenuItem) => {
    if (!item.has_modifiers) return addItem(item.id);
    setBusy(true);
    try {
      const options = await posService.getMenuOptions(item.id);
      if (!options.modifierGroups.length && !options.removableIngredients.length) return await addItem(item.id, {}, true);
      setCustomizer(options);
      setSelectedModifiers(options.modifierGroups.flatMap(group => group.modifier_options.filter(option => option.is_default).map(option => option.id)));
      setRemovedIngredients([]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load options'); }
    finally { setBusy(false); }
  };

  const submitCustomizedItem = async () => {
    if (!customizer) return;
    await addItem(customizer.id, { modifierOptionIds: selectedModifiers, removedIngredientIds: removedIngredients });
    setCustomizer(null);
  };

  const changeQuantity = async (itemId: number, quantity: number) => {
    if (!check || busy || quantity < 1) return;
    setBusy(true);
    try { setCheck(await posService.updateItem(check.id, itemId, quantity, check.version)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update quantity'); }
    finally { setBusy(false); }
  };

  const voidItem = async (itemId: number) => {
    if (!check || busy) return;
    const reason = window.prompt('Reason for removing this item:', 'Customer changed order')?.trim();
    if (!reason) return;
    setBusy(true);
    try { setCheck(await posService.voidItem(check.id, itemId, check.version, reason)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not remove item'); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    const amount = Number(paymentAmount);
    if (!check || amount <= 0 || amount > Number(check.balance) || busy) return;
    setBusy(true);
    try {
      await posService.payCash(check.id, amount);
      const updated = await posService.getCheck(check.id);
      setPaymentOpen(false);
      if (Number(updated.balance) <= 0) {
        setReceipt(await posService.getReceipt(check.id));
        toast.success(`Check #${check.number} paid`);
        setCheck(null);
      } else {
        setCheck(updated);
        toast.success(`${money(amount, data?.branch.currency)} payment recorded`);
      }
      await loadBootstrap();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Payment failed'); }
    finally { setBusy(false); }
  };

  const logout = () => { posService.logout(); setData(null); setEmployee(null); setPin(''); window.location.reload(); };

  if (!branchId) return <CenteredMessage title="POS link is incomplete" detail="Open the POS from a branch setup screen so its branch ID is included." />;

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <section className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
          <p className="text-emerald-400 font-semibold tracking-wide uppercase text-xs">{branchName}</p>
          <h1 className="text-3xl font-black mt-2">Staff sign in</h1>
          <div className="grid grid-cols-2 gap-3 mt-6">
            {employees.map(item => (
              <button key={item.id} onClick={() => { setEmployee(item); setPin(''); }} className={`p-4 rounded-2xl border text-left transition ${employee?.id === item.id ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                <UserRound className="w-5 h-5 mb-3" /><span className="font-bold">{item.name}</span>
              </button>
            ))}
          </div>
          {employee && <div className="mt-6">
            <div className="h-14 rounded-2xl bg-slate-950 border border-slate-700 grid place-items-center text-2xl tracking-[.5em]">{'•'.repeat(pin.length) || 'PIN'}</div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[1,2,3,4,5,6,7,8,9].map(number => <button key={number} onClick={() => pin.length < 8 && setPin(`${pin}${number}`)} className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-xl font-bold">{number}</button>)}
              <button onClick={() => setPin(pin.slice(0, -1))} className="h-14 rounded-xl bg-slate-800 grid place-items-center"><Delete /></button>
              <button onClick={() => pin.length < 8 && setPin(`${pin}0`)} className="h-14 rounded-xl bg-slate-800 text-xl font-bold">0</button>
              <button disabled={busy || pin.length < 4} onClick={signIn} className="h-14 rounded-xl bg-emerald-500 text-slate-950 font-black disabled:opacity-40">Enter</button>
            </div>
          </div>}
        </section>
      </main>
    );
  }

  if (!data.currentShift) return (
    <main className="min-h-screen bg-slate-100 grid place-items-center p-6">
      <section className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-7 shadow-xl">
        <p className="text-emerald-700 font-bold text-sm">{data.branch.name}</p><h1 className="text-3xl font-black mt-1">Open a register</h1>
        <p className="text-slate-500 mt-2">Choose the register for this till shift.</p>
        <div className="grid gap-3 mt-6">{data.registers.map(register => <button disabled={busy} key={register.id} onClick={() => openShift(register.id)} className="p-5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-left"><span className="font-black">{register.name}</span><span className="block text-sm text-slate-500">{register.code}</span></button>)}</div>
      </section>
    </main>
  );

  return (
    <main className="h-screen min-h-[640px] overflow-hidden bg-slate-100 text-slate-950 flex flex-col">
      <header className="h-16 shrink-0 bg-slate-950 text-white px-5 flex items-center justify-between">
        <div><strong className="block leading-tight">{data.branch.name}</strong><span className="text-xs text-slate-400">{data.employee.name} · {data.employee.role}</span></div>
        <button onClick={logout} className="p-2 rounded-xl hover:bg-slate-800" aria-label="Sign out"><LogOut className="w-5 h-5" /></button>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-h-0 flex flex-col border-r border-slate-200">
          <div className="p-4 bg-white border-b border-slate-200">
            <label className="relative block"><Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search menu" className="w-full h-12 pl-12 pr-4 rounded-xl border-slate-200 bg-slate-50 focus:border-emerald-500 focus:ring-emerald-500" /></label>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              <CategoryButton active={activeCategory === null} onClick={() => setActiveCategory(null)}>All</CategoryButton>
              {data.categories.map(category => <CategoryButton key={category.id} active={activeCategory === category.id} onClick={() => setActiveCategory(category.id)}>{category.name_en}</CategoryButton>)}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {visibleMenus.map(item => <button disabled={busy} key={item.id} onClick={() => selectMenuItem(item)} className="min-h-36 overflow-hidden rounded-2xl bg-white border border-slate-200 text-left hover:border-emerald-500 hover:shadow-md transition disabled:opacity-60">
                {item.image_url ? <img src={item.image_url} alt="" loading="lazy" decoding="async" className="w-full h-24 object-cover" /> : <div className="w-full h-20 bg-gradient-to-br from-emerald-50 to-slate-100 grid place-items-center"><ShoppingBag className="text-emerald-600" /></div>}
                <div className="p-3"><strong className="block leading-tight line-clamp-2">{item.name_en}</strong><span className="text-emerald-700 font-black text-sm mt-2 block">{money(item.price, data.branch.currency)}</span></div>
              </button>)}
            </div>
          </div>
        </section>
        <aside className="min-h-0 bg-white flex flex-col">
          <div className="p-5 border-b border-slate-200"><h2 className="text-xl font-black">{check ? `Check #${check.number}` : 'New check'}</h2><p className="text-sm text-slate-500">{cartItems.length} line items</p></div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            {cartItems.length === 0 && <div className="h-full grid place-items-center text-center text-slate-400"><div><ShoppingBag className="w-10 h-10 mx-auto mb-3"/><p>Tap a menu item to begin</p></div></div>}
            {cartItems.map(item => {
              const menu = data.menus.find(value => value.id === item.menu_id);
              const modifierNames = item.customizations?.modifiers?.flatMap(group => group.options.map(option => option.name)).join(', ');
              return <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex justify-between gap-4"><div><strong>{item.menu?.name_en || menu?.name_en || 'Menu item'}</strong>{modifierNames && <span className="block text-xs text-slate-500 mt-1">{modifierNames}</span>}</div><strong>{money(Number(item.price_at_order) * Number(item.quantity), data.branch.currency)}</strong></div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden"><button disabled={busy || Number(item.quantity) <= 1} onClick={() => changeQuantity(item.id, Number(item.quantity) - 1)} className="w-9 h-8 grid place-items-center disabled:opacity-30" aria-label={`Decrease ${menu?.name_en || 'item'}`}><Minus className="w-4 h-4" /></button><span className="w-8 text-center text-sm font-bold">{item.quantity}</span><button disabled={busy} onClick={() => changeQuantity(item.id, Number(item.quantity) + 1)} className="w-9 h-8 grid place-items-center" aria-label={`Increase ${menu?.name_en || 'item'}`}><Plus className="w-4 h-4" /></button></div>
                  {data.employee.permissions.some(permission => permission === 'pos:*' || permission === 'item:void') && <button disabled={busy} onClick={() => voidItem(item.id)} className="w-9 h-8 grid place-items-center text-rose-600 hover:bg-rose-50 rounded-lg" aria-label={`Remove ${menu?.name_en || 'item'}`}><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>;
            })}
          </div>
          <div className="p-5 border-t border-slate-200 bg-white">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(check?.subtotal || 0, data.branch.currency)}</span></div>
            <div className="flex justify-between items-end mt-2"><strong className="text-lg">Total</strong><strong className="text-3xl">{money(check?.balance || 0, data.branch.currency)}</strong></div>
            {check && Number(check.paid) > 0 && <div className="flex justify-between text-sm text-emerald-700 mt-2"><span>Paid</span><strong>{money(check.paid, data.branch.currency)}</strong></div>}
            <button disabled={!check || Number(check.balance) <= 0 || busy} onClick={() => { setPaymentAmount(String(Number(check?.balance || 0))); setPaymentOpen(true); }} className="w-full h-16 mt-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg flex items-center justify-center gap-2 disabled:opacity-40"><Banknote /> Take payment</button>
          </div>
        </aside>
      </div>

      {customizer && <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-5">
        <section className="w-full sm:max-w-xl max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden">
          <header className="p-5 border-b border-slate-200 flex items-center justify-between"><div><p className="text-xs font-bold text-emerald-700 uppercase">Customize</p><h2 className="text-2xl font-black">{customizer.name}</h2></div><button onClick={() => setCustomizer(null)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="Close customization"><X /></button></header>
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {customizer.modifierGroups.map(group => <fieldset key={group.id}><legend className="font-black">{group.name_en} <span className="text-xs text-slate-500 font-normal">Choose {group.min_select || 0}-{group.max_select || 1}</span></legend><div className="grid gap-2 mt-3">{group.modifier_options.map(option => { const selected = selectedModifiers.includes(option.id); return <button type="button" key={option.id} onClick={() => setSelectedModifiers(current => {
              if (selected) return current.filter(id => id !== option.id);
              if (group.selection_type === 'single' || group.max_select === 1) {
                const groupIds = new Set(group.modifier_options.map(value => value.id));
                return [...current.filter(id => !groupIds.has(id)), option.id];
              }
              if (current.filter(id => group.modifier_options.some(value => value.id === id)).length >= Number(group.max_select || 99)) return current;
              return [...current, option.id];
            })} className={`p-3 rounded-xl border flex justify-between ${selected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}><span>{option.name_en}</span><span className="font-bold">+{money(option.price_delta, data.branch.currency)}</span></button>; })}</div></fieldset>)}
            {customizer.removableIngredients.length > 0 && <fieldset><legend className="font-black">Remove ingredients</legend><div className="flex flex-wrap gap-2 mt-3">{customizer.removableIngredients.map(ingredient => { const removed = removedIngredients.includes(ingredient.id); return <button type="button" key={ingredient.id} onClick={() => setRemovedIngredients(current => removed ? current.filter(id => id !== ingredient.id) : [...current, ingredient.id])} className={`px-3 py-2 rounded-xl border ${removed ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200'}`}>{ingredient.name_en}</button>; })}</div></fieldset>}
          </div>
          <footer className="p-5 border-t border-slate-200"><button disabled={busy} onClick={submitCustomizedItem} className="w-full h-14 rounded-2xl bg-emerald-600 text-white font-black">Add to check</button></footer>
        </section>
      </div>}

      {paymentOpen && check && <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm grid place-items-center p-5">
        <section className="w-full max-w-md bg-white rounded-3xl p-6"><div className="flex justify-between"><div><p className="text-xs font-bold text-emerald-700 uppercase">Split tender supported</p><h2 className="text-2xl font-black">Cash payment</h2></div><button onClick={() => setPaymentOpen(false)} className="p-2" aria-label="Close payment"><X /></button></div><p className="text-slate-500 mt-2">Remaining {money(check.balance, data.branch.currency)}</p>
          <label className="block mt-5 text-sm font-bold">Amount<input autoFocus inputMode="decimal" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} className="mt-2 w-full h-14 rounded-xl border-slate-200 text-2xl font-black" /></label>
          <div className="grid grid-cols-3 gap-2 mt-3">{[0.25, 0.5, 1].map(portion => <button key={portion} onClick={() => setPaymentAmount((Number(check.balance) * portion).toFixed(2))} className="h-10 rounded-xl bg-slate-100 font-bold">{portion === 1 ? 'Full' : `${portion * 100}%`}</button>)}</div>
          <button disabled={busy || Number(paymentAmount) <= 0 || Number(paymentAmount) > Number(check.balance)} onClick={pay} className="w-full h-14 mt-5 rounded-2xl bg-emerald-600 text-white font-black disabled:opacity-40">Record cash payment</button>
        </section>
      </div>}

      {receipt && <div className="pos-receipt-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm grid place-items-center p-5 print:static print:bg-white print:p-0">
        <section className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6 print:max-w-none print:shadow-none"><div className="flex justify-between print:hidden"><h2 className="text-2xl font-black flex items-center gap-2"><ReceiptText /> Receipt</h2><button onClick={() => setReceipt(null)} className="p-2" aria-label="Close receipt"><X /></button></div><div className="text-center mt-5"><h3 className="text-xl font-black">{receipt.restaurant}</h3><p className="text-sm text-slate-500">{receipt.branch} · {receipt.receiptNumber}</p></div>
          <div className="border-y border-dashed border-slate-300 py-4 my-5 space-y-3">{receipt.check.orders?.flatMap(order => order.order_items).filter(item => item.status === 'ACTIVE').map(item => <div key={item.id} className="flex justify-between"><span>{item.quantity} × {item.menu?.name_en || 'Item'}</span><strong>{money(Number(item.price_at_order) * Number(item.quantity), receipt.currency)}</strong></div>)}</div>
          <div className="flex justify-between text-xl"><strong>Total</strong><strong>{money(receipt.totals.total, receipt.currency)}</strong></div>{Number(receipt.totals.refunded) > 0 && <div className="flex justify-between text-rose-700 mt-2"><span>Refunded</span><strong>-{money(receipt.totals.refunded, receipt.currency)}</strong></div>}
          <button onClick={() => window.print()} className="w-full h-12 mt-6 rounded-xl bg-slate-950 text-white font-bold flex items-center justify-center gap-2 print:hidden"><Printer className="w-4 h-4" /> Print receipt</button>
        </section>
      </div>}
    </main>
  );
}

function CategoryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold ${active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{children}</button>;
}

function CenteredMessage({ title, detail }: { title: string; detail: string }) {
  return <main className="min-h-screen bg-slate-100 grid place-items-center p-6"><section className="max-w-md bg-white rounded-3xl border border-slate-200 p-8 text-center"><h1 className="text-2xl font-black">{title}</h1><p className="text-slate-500 mt-3">{detail}</p></section></main>;
}

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Minus } from "lucide-react";
import { menuService } from "../../services/menuService";

/**
 * MenuItemCustomizer
 * - Fetches menu config (ingredients, modifier groups, combo groups)
 * - Lets user pick removals/extras/options/quantity
 * - Computes live price & shows a readable snapshot
 * - Emits a CartLine payload compatible with the Edge Function
 *
 * Usage:
 * <MenuItemCustomizer
 *    menuId={menu.id}
 *    defaultQuantity={1}
 *    onCancel={() => setOpen(false)}
 *    onAdd={(cartLine) => addToCart(cartLine)}
 * />
 */

// -------- Types (align with your Edge Function) --------
export type IngredientPick = {
  ingredientId: string;
  action: "remove" | "extra";
  qty?: number;
};
export type OptionPick = { optionId: string; qty?: number };
export type ComboChildPick = { childMenuId: string; notes?: string };
export type CartLine = {
  menuId: string;
  quantity: number;
  notes?: string;
  ingredients?: IngredientPick[];
  options?: OptionPick[];
  comboChildren?: ComboChildPick[];
};

// --- DB result shapes ---
interface MenuRow {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  price: number | null;
  image_url: string | null;
}
interface IngredientRow {
  menu_id: string;
  ingredient_id: string;
  removable: boolean | null;
  extra_available: boolean | null;
  max_extra: number | null;
  extra_price_override: number | null;
  ingredients: {
    id: string;
    name_en: string | null;
    name_ar: string | null;
    extra_price: number | null;
  };
  ingredient?: { // Fix: Match usage (row.ingredient) and schema
    id: string;
    name_en: string | null;
    name_ar: string | null;
    extra_price: number | null;
  };
}
interface ModifierOptionRow {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  price_delta: number | null;
  max_qty: number | null;
  is_default: boolean | null;
}
interface ModifierGroupRow {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  selection_type: "single" | "multi";
  min_select: number | null;
  max_select: number | null;
  required: boolean | null;
  modifier_options: ModifierOptionRow[];
}
interface MenuModifierGroupRow {
  menu_id: string;
  modifier_group: ModifierGroupRow; // Fix: Match usage (row.modifier_group)
}
interface ComboGroupItemRow {
  child_menu_id: string;
  is_default: boolean | null;
  upgrade_price_delta: number | null;
  menus?: { id: string; name_en: string | null; price: number | null };
}
interface ComboGroupRow {
  id: string;
  menu_id: string;
  min_select: number | null;
  max_select: number | null;
  combo_group_items: ComboGroupItemRow[];
}

// -------- Hook: load config for a menu --------
function useMenuConfig(menuId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [menu, setMenu] = useState<MenuRow | null>(null);
  const [mi, setMI] = useState<IngredientRow[]>([]);
  const [mmg, setMMG] = useState<MenuModifierGroupRow[]>([]);
  const [combo, setCombo] = useState<ComboGroupRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await menuService.getMenuConfig(menuId);

        if (!active) return;
        setMenu(data.menu);
        setMI(data.ingredients);
        setMMG(data.modifierGroups);
        setCombo(data.comboGroups);
      } catch (e: any) {
        if (!active) return;
        setError(e.message || String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [menuId]);

  // pre-compute useful maps
  const ingredientConfig = useMemo(() => {
    const byId = new Map<
      string,
      {
        name: string;
        removable: boolean;
        extra: boolean;
        maxExtra: number;
        effPrice: number;
      }
    >();
    for (const row of mi) {
      const name = row.ingredient?.name_en || "ingredient";
      const eff = (row.extra_price_override ??
        row.ingredient?.extra_price ??
        0) as number;
      byId.set(row.ingredient_id, {
        name,
        removable: !!row.removable,
        extra: !!row.extra_available,
        maxExtra: Number(row.max_extra ?? 0),
        effPrice: Number(eff || 0),
      });
    }
    return byId;
  }, [mi]);

  const groups = useMemo(
    () => (mmg || []).map((x) => x.modifier_group),
    [mmg]
  );

  return {
    loading,
    error,
    menu,
    ingredients: mi,
    ingredientConfig,
    groups,
    combo,
  };
}

// -------- Small UI helpers --------
function TriState({
  value,
  onChange,
  disabledRemove,
  disabledExtra,
  maxExtra,
}: {
  value: "default" | "remove" | "extra";
  onChange: (v: "default" | "remove" | "extra", qty?: number) => void;
  disabledRemove?: boolean;
  disabledExtra?: boolean;
  maxExtra?: number;
}) {
  const [qty, setQty] = useState(1);
  useEffect(() => {
    if (value !== "extra") setQty(1);
  }, [value]);
  return (
    <div className="flex items-center gap-2">
      <button
        className={`px-2 py-1 rounded-xl border ${value === "remove" ? "bg-red-50 border-red-300" : "border-zinc-300"
          }`}
        onClick={() => onChange(value === "remove" ? "default" : "remove")}
        disabled={disabledRemove}
        title={disabledRemove ? "Not removable" : "Remove"}
      >
        no
      </button>
      <button
        className={`px-2 py-1 rounded-xl border ${value === "extra"
          ? "bg-emerald-50 border-emerald-300"
          : "border-zinc-300"
          }`}
        onClick={() => onChange(value === "extra" ? "default" : "extra", qty)}
        disabled={disabledExtra}
        title={disabledExtra ? "No extra allowed" : "Extra"}
      >
        extra
      </button>
      <div
        className={`flex items-center gap-1 ${value === "extra" ? "opacity-100" : "opacity-50"
          }`}
      >
        <button
          className="p-1 rounded border"
          onClick={() => setQty(Math.max(1, qty - 1))}
        >
          <Minus size={14} />
        </button>
        <span className="min-w-5 text-center text-sm">{qty}</span>
        <button
          className="p-1 rounded border"
          onClick={() =>
            setQty(maxExtra ? Math.min(maxExtra, qty + 1) : qty + 1)
          }
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function Money({ value }: { value: number }) {
  return <span className="tabular-nums">{value.toFixed(2)}</span>;
}

// -------- Main component --------
export default function MenuItemCustomizer({
  menuId,
  defaultQuantity = 1,
  onAdd,
  onCancel,
}: {
  menuId: string;
  defaultQuantity?: number;
  onAdd: (line: CartLine) => void;
  onCancel?: () => void;
}) {
  const { loading, error, menu, ingredients, ingredientConfig, groups, combo } =
    useMenuConfig(menuId);

  // picks state
  const [qty, setQty] = useState(defaultQuantity);
  const [note, setNote] = useState("");
  const [ingState, setIngState] = useState<
    Record<string, { mode: "default" | "remove" | "extra"; qty?: number }>
  >({});
  const [optState, setOptState] = useState<Record<string, number>>({}); // optionId -> qty
  const [childrenState, setChildrenState] = useState<Record<string, string>>(
    {}
  ); // comboGroupId -> childMenuId

  useEffect(() => {
    setQty(defaultQuantity);
  }, [defaultQuantity]);

  // constraints & pricing
  const optionErrors = useMemo(() => {
    const errs: string[] = [];
    for (const g of groups) {
      const optsInGroup = g.modifier_options || [];
      const selectedCount = optsInGroup.filter(
        (o) => (optState[o.id] ?? 0) > 0
      ).length;
      const min = g.min_select ?? 0;
      const max = g.max_select ?? (g.selection_type === "single" ? 1 : 99);
      const required = !!g.required;
      if (required && selectedCount === 0)
        errs.push(`${g.name_en || "Group"} is required`);
      if (selectedCount < min)
        errs.push(`${g.name_en || "Group"}: select at least ${min}`);
      if (selectedCount > max)
        errs.push(`${g.name_en || "Group"}: select at most ${max}`);
      if (g.selection_type === "single") {
        // force qty 1 in single groups
        optsInGroup.forEach((o) => {
          if ((optState[o.id] ?? 0) > 1)
            errs.push(`${g.name_en || "Group"}: only 1 allowed`);
        });
      }
      optsInGroup.forEach((o) => {
        const q = optState[o.id] ?? 0;
        if (q > 0 && o.max_qty && q > o.max_qty)
          errs.push(`${o.name_en || "Option"}: max ${o.max_qty}`);
      });
    }
    return errs;
  }, [groups, optState]);

  const pricing = useMemo(() => {
    const base = Number(menu?.price ?? 0);
    let extrasDelta = 0;
    for (const [ingId, st] of Object.entries(ingState)) {
      if (st.mode === "extra") {
        const cfg = ingredientConfig.get(ingId);
        if (cfg) {
          const q = Math.max(1, Number(st.qty ?? 1));
          extrasDelta += (cfg.effPrice || 0) * q;
        }
      }
    }
    let optionsDelta = 0;
    for (const g of groups) {
      for (const o of g.modifier_options || []) {
        const q = optState[o.id] ?? 0;
        if (q > 0) optionsDelta += Number(o.price_delta ?? 0) * Math.max(1, q);
      }
    }
    let childrenDelta = 0;
    for (const cg of combo) {
      const childId = childrenState[cg.id];
      if (!childId) continue;
      const item = (cg.combo_group_items || []).find(
        (i) => i.child_menu_id === childId
      );
      if (item) childrenDelta += Number(item.upgrade_price_delta ?? 0);
    }
    const unit = base + extrasDelta + optionsDelta + childrenDelta;
    const total = unit * qty;
    return { base, extrasDelta, optionsDelta, childrenDelta, unit, total };
  }, [
    menu?.price,
    ingState,
    ingredientConfig,
    groups,
    optState,
    combo,
    childrenState,
    qty,
  ]);

  const snapshot = useMemo(() => {
    const lines: string[] = [];
    // ingredients snapshot
    for (const [ingId, st] of Object.entries(ingState)) {
      const cfg = ingredientConfig.get(ingId);
      if (!cfg) continue;
      if (st.mode === "remove") lines.push(`no ${cfg.name}`);
      if (st.mode === "extra")
        lines.push(
          `extra ${cfg.name}${st.qty && st.qty > 1 ? ` x${st.qty}` : ""}`
        );
    }
    // options snapshot
    for (const g of groups) {
      for (const o of g.modifier_options || []) {
        const q = optState[o.id] ?? 0;
        if (q > 0)
          lines.push(`${o.name_en || "option"}${q > 1 ? ` x${q}` : ""}`);
      }
    }
    // children snapshot
    for (const cg of combo) {
      const childId = childrenState[cg.id];
      if (!childId) continue;
      const it = (cg.combo_group_items || []).find(
        (i) => i.child_menu_id === childId
      );
      if (it?.menus?.name_en) lines.push(`+ ${it.menus.name_en}`);
    }
    return lines;
  }, [ingState, ingredientConfig, groups, optState, combo, childrenState]);

  const canAdd = useMemo(
    () => optionErrors.length === 0 && qty > 0,
    [optionErrors, qty]
  );

  // build CartLine payload for Edge Function
  const cartLine: CartLine = useMemo(() => {
    const ingredients: IngredientPick[] = [];
    for (const [ingId, st] of Object.entries(ingState)) {
      if (st.mode === "remove")
        ingredients.push({ ingredientId: ingId, action: "remove" });
      if (st.mode === "extra")
        ingredients.push({
          ingredientId: ingId,
          action: "extra",
          qty: Math.max(1, Number(st.qty || 1)),
        });
    }
    const options: OptionPick[] = [];
    for (const g of groups) {
      for (const o of g.modifier_options || []) {
        const q = optState[o.id] ?? 0;
        if (q > 0) options.push({ optionId: o.id, qty: Math.max(1, q) });
      }
    }
    const comboChildren: ComboChildPick[] = [];
    for (const cg of combo) {
      const childId = childrenState[cg.id];
      if (childId) comboChildren.push({ childMenuId: childId });
    }
    return {
      menuId,
      quantity: qty,
      notes: note || undefined,
      ingredients: ingredients.length ? ingredients : undefined,
      options: options.length ? options : undefined,
      comboChildren: comboChildren.length ? comboChildren : undefined,
    };
  }, [menuId, qty, note, ingState, groups, optState, combo, childrenState]);

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400 text-sm">Loading menu details…</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">Error Loading Item</h3>
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    </div>
  );
  if (!menu) return (
    <div className="p-6">
      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
        <p className="text-slate-600 dark:text-slate-400">Item not found.</p>
      </div>
    </div>
  );

  return (

    <div className="h-full flex flex-col bg-white dark:bg-slate-800">
      {/* Sticky Navbar */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-700/50 px-4 h-14 flex items-center justify-between">
        <div className="opacity-0 transition-opacity duration-300 font-semibold" id="sticky-title">
          {/* Title fades in on scroll - simple implementation: just hide for now or show always if we want. 
               Let's show the Name always for context, it's safer UX. */}
          {menu.name_en}
        </div>
        <button
          onClick={onCancel}
          className="ml-auto p-2 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          aria-label="Close"
        >
          <X size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollPaddingTop: '3.5rem' }}>

        {/* Hero Image */}
        {menu.image_url && (
          <div className="relative w-full h-64 sm:h-72">
            <img
              src={menu.image_url}
              alt={menu.name_en || 'Menu Item'}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
          </div>
        )}

        <div className="px-5 py-6">
          {/* Header Info */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">
              {menu.name_en}
            </h1>
            <div className="flex items-center gap-2 text-lg font-medium text-emerald-600 dark:text-emerald-400">
              <Money value={Number(menu.price || 0)} />
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">base price</span>
            </div>
            {/* If we had a description, it would go here */}
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-700/50 mb-8" />


          {/* Ingredients (remove / extra) */}
          {ingredients.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Ingredients</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ingredients.map((row) => {
                  const cfg = ingredientConfig.get(row.ingredient_id);
                  const st = ingState[row.ingredient_id] || { mode: "default" as const };
                  return (
                    <div
                      key={row.ingredient_id}
                      className="flex flex-col p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{cfg?.name || "Ingredient"}</span>
                        {cfg?.extra && <span className="text-xs font-semibold text-emerald-600">+<Money value={cfg.effPrice} /></span>}
                      </div>

                      <TriState
                        value={st.mode}
                        onChange={(mode, q) =>
                          setIngState((s) => ({ ...s, [row.ingredient_id]: { mode, qty: q } }))
                        }
                        disabledRemove={!cfg?.removable}
                        disabledExtra={!cfg?.extra}
                        maxExtra={cfg?.maxExtra}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Modifier groups */}
          {groups.length > 0 && (
            <section className="mb-8">
              <div className="space-y-8">
                {groups.map((g) => {
                  const currentSelectionCount = (g.modifier_options || []).reduce((acc, o) => acc + (optState[o.id] || 0), 0);
                  const isSatisfied = (!g.required) || (currentSelectionCount >= (g.min_select || 0));

                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{g.name_en || "Options"}</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {g.selection_type === "single" ? "Select 1" : `Select up to ${g.max_select}`}
                          </p>
                        </div>
                        {g.required && (
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${isSatisfied ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {isSatisfied ? 'Completed' : 'Required'}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {(g.modifier_options || []).map((o) => {
                          const selQty = optState[o.id] ?? 0;
                          const isSelected = selQty > 0;
                          const single = g.selection_type === "single";

                          return (
                            <div
                              key={o.id}
                              onClick={() => {
                                if (single) {
                                  setOptState((s) => {
                                    const next = { ...s };
                                    for (const other of g.modifier_options || []) next[other.id] = 0;
                                    next[o.id] = 1; // Toggle off not allowed for required single? usually radio behavior.
                                    // Actually for single, clicking usually selects it. 
                                    // If not required, maybe toggle? Let's stick to standard Select behavior.
                                    return next;
                                  })
                                } else {
                                  // Multi select: toggle on/off (1 or 0) for simple, or stepper if max_qty > 1?
                                  // The previous UI had steppers for multi. Let's keep that logic but simplify the tap interaction.
                                  // If max_qty is 1 (checkbox behavior), tap toggles.
                                  // If max_qty > 1, tap increments?

                                  // Let's keep the stepper UI for multi-qty items, but improve visual.
                                  if (o.max_qty && o.max_qty > 1) {
                                    // Use stepper logic
                                    // Don't toggle on main click if it has complex controls.
                                  } else {
                                    // Toggle behavior
                                    setOptState((s) => ({
                                      ...s,
                                      [o.id]: isSelected ? 0 : 1
                                    }))
                                  }
                                }
                              }}
                              className={`group relative flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${isSelected
                                ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-500/50"
                                : "border-transparent bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-slate-300 dark:border-slate-600"
                                  }`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                <div className="flex flex-col">
                                  <span className={`font-medium ${isSelected ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {o.name_en}
                                  </span>
                                  {Number(o.price_delta) > 0 && (
                                    <span className="text-sm text-slate-500">
                                      +<Money value={Number(o.price_delta)} />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Controls for multi-qty items */}
                              {!single && o.max_qty && o.max_qty > 1 && (
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                                    onClick={() => setOptState(s => ({ ...s, [o.id]: Math.max(0, (s[o.id] || 0) - 1) }))}
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="w-4 text-center font-medium">{selQty}</span>
                                  <button
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
                                    onClick={() => setOptState(s => ({ ...s, [o.id]: Math.min(o.max_qty || 99, (s[o.id] || 0) + 1) }))}
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {optionErrors.length > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-lg text-sm font-medium">
                    ⚠️ {optionErrors[0]}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Combo groups (choose child items) */}
          {combo.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Make it a meal</h3>
              <div className="space-y-3">
                {combo.map((cg) => (
                  <div key={cg.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                    <div className="mb-3">
                      <span className="font-medium text-slate-900 dark:text-white">Choose item</span>
                      <span className="text-sm text-slate-500 ml-2">(Optional)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(cg.combo_group_items || []).map((ci) => {
                        const selected = childrenState[cg.id] === ci.child_menu_id;
                        return (
                          <button
                            key={ci.child_menu_id}
                            className={`text-left relative flex items-center justify-between p-3 rounded-lg border-2 transition-all ${selected
                              ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                              : "border-transparent bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            onClick={() =>
                              setChildrenState((s) => ({
                                ...s,
                                [cg.id]: selected ? "" : ci.child_menu_id,
                              }))
                            }
                          >
                            <div>
                              <div className={`font-medium ${selected ? 'text-purple-900 dark:text-purple-200' : 'text-slate-700 dark:text-slate-300'}`}>
                                {ci.menus?.name_en || "Item"}
                              </div>
                              <div className="text-xs text-slate-500">
                                +<Money value={Number(ci.upgrade_price_delta || 0)} />
                              </div>
                            </div>
                            {selected && (
                              <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          <section className="mb-8">
            <label className="text-lg font-bold text-slate-900 dark:text-white block mb-3">Special Instructions</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note for the kitchen (e.g. no onions, extra sauce)..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              rows={3}
            />
          </section>

          {/* Receipt / Summary */}
          <section className="mb-8 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 border-dashed">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-slate-500 dark:text-slate-400">Subtotal</span>
              <span className="font-medium text-slate-900 dark:text-white"><Money value={pricing.total} /></span>
            </div>
            {snapshot.length > 0 && (
              <div className="pt-2 border-t border-slate-200/50 dark:border-slate-700/50 mt-2">
                <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
                  {snapshot.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}
          </section>

          {/* Spacer for sticky footer */}
          <div className="h-10" />

        </div>
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 md:px-6 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4 max-w-lg mx-auto w-full">
          {/* Quantity Stepper */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-full p-1">
            <button
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white disabled:opacity-50"
              onClick={() => setQty(Math.max(1, qty - 1))}
              disabled={qty <= 1}
            >
              <Minus size={18} />
            </button>
            <span className="w-12 text-center font-bold text-lg text-slate-900 dark:text-white">{qty}</span>
            <button
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white"
              onClick={() => setQty(qty + 1)}
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Add Button */}
          <button
            onClick={() => {
              if (!canAdd) {
                if (optionErrors.length > 0) {
                  import("react-hot-toast").then((mod) => {
                    mod.default.error(optionErrors[0]);
                  });
                }
                return;
              }
              onAdd(cartLine);
            }}
            disabled={!canAdd}
            className={`flex-1 h-12 rounded-full font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-between px-6 ${canAdd
              ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
              : "bg-slate-400 cursor-not-allowed"
              }`}
          >
            <span>Add to Order</span>
            <span><Money value={pricing.total} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

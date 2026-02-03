import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Minus, ChevronDown } from "lucide-react";
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

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!menu) return <div className="p-4">Item not found.</div>;

  return (
    <div className="max-w-2xl w-full p-4 md:p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold">{menu.name_en}</h2>
          <div className="text-sm text-zinc-600">
            Base: <Money value={Number(menu.price || 0)} />
          </div>
        </div>
        {onCancel && (
          <button
            className="p-2 rounded-lg hover:bg-zinc-100"
            onClick={onCancel}
          >
            <X />
          </button>
        )}
      </div>

      {/* Ingredients (remove / extra) */}
      {ingredients.length > 0 && (
        <section className="mb-6">
          <h3 className="font-medium mb-2">Ingredients</h3>
          <div className="space-y-3">
            {ingredients.map((row) => {
              const cfg = ingredientConfig.get(row.ingredient_id);
              const st = ingState[row.ingredient_id] || {
                mode: "default" as const,
              };
              return (
                <div
                  key={row.ingredient_id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {cfg?.name || "ingredient"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {cfg?.extra
                        ? `extra +${(cfg?.effPrice || 0).toFixed(2)}`
                        : "no extra"}
                      {cfg?.maxExtra ? ` · max ${cfg.maxExtra}` : ""}
                      {cfg?.removable ? "" : " · not removable"}
                    </div>
                  </div>
                  <TriState
                    value={st.mode}
                    onChange={(mode, q) =>
                      setIngState((s) => ({
                        ...s,
                        [row.ingredient_id]: { mode, qty: q },
                      }))
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
        <section className="mb-6">
          <h3 className="font-medium mb-2">Options</h3>
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">
                    {g.name_en || "Group"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {g.selection_type === "single"
                      ? "choose 1"
                      : `choose up to ${g.max_select ?? "…"}`}
                    {g.required ? " · required" : ""}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(g.modifier_options || []).map((o) => {
                    const selQty = optState[o.id] ?? 0;
                    const single = g.selection_type === "single";
                    return (
                      <div
                        key={o.id}
                        className={`flex items-center justify-between rounded-lg border p-2 ${selQty > 0
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-zinc-200"
                          }`}
                      >
                        <div>
                          <div className="text-sm">{o.name_en}</div>
                          <div className="text-xs text-zinc-500">
                            {Number(o.price_delta || 0) >= 0 ? "+" : ""}
                            <Money value={Number(o.price_delta || 0)} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {single ? (
                            <button
                              className={`px-2 py-1 rounded border ${selQty
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "border-zinc-300"
                                }`}
                              onClick={() =>
                                setOptState((s) => {
                                  const next = { ...s };
                                  // clear other options in this group
                                  for (const other of g.modifier_options || [])
                                    next[other.id] = 0;
                                  next[o.id] = selQty ? 0 : 1;
                                  return next;
                                })
                              }
                            >
                              {selQty ? "Selected" : "Select"}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1 rounded border"
                                onClick={() =>
                                  setOptState((s) => ({
                                    ...s,
                                    [o.id]: Math.max(0, (s[o.id] || 0) - 1),
                                  }))
                                }
                              >
                                <Minus size={14} />
                              </button>
                              <span className="min-w-5 text-center text-sm">
                                {selQty}
                              </span>
                              <button
                                className="p-1 rounded border"
                                onClick={() =>
                                  setOptState((s) => ({
                                    ...s,
                                    [o.id]: Math.min(
                                      o.max_qty || 99,
                                      (s[o.id] || 0) + 1
                                    ),
                                  }))
                                }
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {optionErrors.length > 0 && (
              <div className="text-xs text-red-600">{optionErrors[0]}</div>
            )}
          </div>
        </section>
      )}

      {/* Combo groups (choose child items) */}
      {combo.length > 0 && (
        <section className="mb-6">
          <h3 className="font-medium mb-2">Make it a meal</h3>
          <div className="space-y-4">
            {combo.map((cg) => (
              <div key={cg.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">
                    Choose: {cg.min_select ?? 0}–{cg.max_select ?? 1}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(cg.combo_group_items || []).map((ci) => {
                    const selected = childrenState[cg.id] === ci.child_menu_id;
                    return (
                      <button
                        key={ci.child_menu_id}
                        className={`text-left rounded-lg border p-2 ${selected
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-zinc-200"
                          }`}
                        onClick={() =>
                          setChildrenState((s) => ({
                            ...s,
                            [cg.id]: selected ? "" : ci.child_menu_id,
                          }))
                        }
                      >
                        <div className="text-sm font-medium">
                          {ci.menus?.name_en || "Item"}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Upgrade +
                          <Money value={Number(ci.upgrade_price_delta || 0)} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes & Quantity */}
      <section className="mb-4">
        <label className="text-sm font-medium">Notes</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add special instructions"
          className="mt-1 w-full rounded-xl border p-2"
          rows={2}
        />
      </section>

      <section className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded border"
            onClick={() => setQty(Math.max(1, qty - 1))}
          >
            <Minus />
          </button>
          <span className="w-8 text-center font-medium">{qty}</span>
          <button
            className="p-2 rounded border"
            onClick={() => setQty(qty + 1)}
          >
            <Plus />
          </button>
        </div>
        <div className="text-sm text-zinc-600">
          <span className="mr-3">
            Base <Money value={pricing.base} />
          </span>
          <span className="mr-3">
            Options <Money value={pricing.optionsDelta} />
          </span>
          <span className="mr-3">
            Extras <Money value={pricing.extrasDelta} />
          </span>
          {pricing.childrenDelta !== 0 && (
            <span>
              Upgrades <Money value={pricing.childrenDelta} />
            </span>
          )}
        </div>
      </section>

      {/* Snapshot */}
      <section className="mb-6">
        <div className="rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Summary</div>
            <div className="text-emerald-700 font-semibold">
              Unit <Money value={pricing.unit} /> · Total{" "}
              <Money value={pricing.total} />
            </div>
          </div>
          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 space-y-1">
            {snapshot.length ? (
              snapshot.map((s, i) => <li key={i}>{s}</li>)
            ) : (
              <li>No customizations</li>
            )}
          </ul>
        </div>
      </section>

      <div className="flex items-center gap-3">
        {onCancel && (
          <button className="px-4 py-2 rounded-xl border" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          onClick={() => {
            if (!canAdd) {
              if (optionErrors.length > 0) {
                // Show the specific validation error
                import("react-hot-toast").then((mod) => {
                  mod.default.error(optionErrors[0]);
                });
              }
              return;
            }
            onAdd(cartLine);
          }}
          className={`px-4 py-2 rounded-xl text-white ${canAdd
            ? "bg-emerald-600 hover:bg-emerald-700"
            : "bg-emerald-600/50 hover:bg-emerald-600/60" // Valid visual cue but still clickable
            }`}
        >
          Add · <Money value={pricing.total} />
        </button>
      </div>
    </div>
  );
}

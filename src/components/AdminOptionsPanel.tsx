import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from "lucide-react";

/**
 * AdminOptionsPanel
 *
 * Shown inside the admin menu form AFTER the base menu row exists (has id).
 * Lets the admin configure:
 *  - Ingredient config per menu (removable / extra / max_extra / extra_price_override)
 *  - Modifier Groups (single/multi, min/max, required) and Options with price_delta
 *  - Combo Groups (parent menu -> allowed child menus with upgrade_price_delta)
 *
 * Tables used (expected columns):
 *  - menu_ingredients(menu_id, ingredient_id, removable, extra_available, max_extra, extra_price_override)
 *  - modifier_groups(id, name_en, name_ar, selection_type, min_select, max_select, required)
 *  - modifier_options(id, group_id, name_en, name_ar, price_delta, max_qty, is_default)
 *  - menu_modifier_groups(menu_id, group_id)
 *  - combo_groups(id, menu_id, min_select, max_select)
 *  - combo_group_items(group_id, child_menu_id, is_default, upgrade_price_delta)
 */

export default function AdminOptionsPanel({
  menuId,
  adminId,
}: {
  menuId: string;
  adminId?: string;
}) {
  const [tab, setTab] = useState<"ingredients" | "options" | "combo">(
    "ingredients"
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalog data
  const [allIngredients, setAllIngredients] = useState<
    Array<{
      id: string;
      name_en: string | null;
      name_ar: string | null;
      extra_price: number | null;
    }>
  >([]);
  const [allMenus, setAllMenus] = useState<
    Array<{ id: string; name_en: string | null; price: number | null }>
  >([]);

  // Menu-specific config state
  type IngCfg = {
    ingredient_id: string;
    removable: boolean;
    extra_available: boolean;
    max_extra: number;
    extra_price_override: number | null;
  };
  const [ingCfg, setIngCfg] = useState<IngCfg[]>([]);

  type ModOption = {
    id?: string;
    name_en: string;
    name_ar?: string | null;
    price_delta: number;
    max_qty?: number | null;
    is_default?: boolean;
  };
  type ModGroup = {
    id?: string;
    name_en: string;
    name_ar?: string | null;
    selection_type: "single" | "multi";
    min_select?: number | null;
    max_select?: number | null;
    required?: boolean;
    options: ModOption[];
  };
  const [groups, setGroups] = useState<ModGroup[]>([]);

  type ComboItem = {
    child_menu_id: string;
    upgrade_price_delta: number;
    is_default?: boolean;
  };
  type ComboGroup = {
    id?: string;
    min_select?: number | null;
    max_select?: number | null;
    items: ComboItem[];
  };
  const [combo, setCombo] = useState<ComboGroup>({ items: [] });

  useEffect(() => {
    if (menuId) void loadAll();
  }, [menuId]);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [{ data: ingr }, { data: menus }] = await Promise.all([
        supabase
          .from("ingredients")
          .select("id, name_en, name_ar, extra_price")
          .order("name_en"),
        supabase
          .from("menus")
          .select("id, name_en, price")
          .is("deleted_at", null)
          .order("name_en"),
      ]);
      setAllIngredients(ingr || []);
      setAllMenus(menus || []);

      // ingredients for this menu
      const { data: mi } = await supabase
        .from("menu_ingredients")
        .select(
          "ingredient_id, removable, extra_available, max_extra, extra_price_override"
        )
        .eq("menu_id", menuId);
      setIngCfg(
        (mi || []).map((r) => ({
          ingredient_id: r.ingredient_id,
          removable: !!r.removable,
          extra_available: !!r.extra_available,
          max_extra: Number(r.max_extra ?? 0),
          extra_price_override:
            r.extra_price_override == null
              ? null
              : Number(r.extra_price_override),
        }))
      );

      // modifier groups attached to this menu
      const { data: mmg } = await supabase
        .from("menu_modifier_groups")
        .select(
          "modifier_groups(id, name_en, name_ar, selection_type, min_select, max_select, required, modifier_options(id, name_en, name_ar, price_delta, max_qty, is_default))"
        )
        .eq("menu_id", menuId);

      const g = (mmg || []).map((x: any) => x.modifier_groups).filter(Boolean);
      setGroups(
        (g || []).map((gr: any) => ({
          id: gr.id,
          name_en: gr.name_en || "",
          name_ar: gr.name_ar,
          selection_type: (gr.selection_type || "single") as "single" | "multi",
          min_select: gr.min_select,
          max_select: gr.max_select,
          required: !!gr.required,
          options: (gr.modifier_options || []).map((o: any) => ({
            id: o.id,
            name_en: o.name_en || "",
            name_ar: o.name_ar,
            price_delta: Number(o.price_delta || 0),
            max_qty: o.max_qty,
            is_default: !!o.is_default,
          })),
        }))
      );

      // combo for this parent menu (assume 1 group per parent for now)
      const { data: cg } = await supabase
        .from("combo_groups")
        .select(
          "id, min_select, max_select, combo_group_items(child_menu_id, upgrade_price_delta, is_default)"
        )
        .eq("menu_id", menuId)
        .limit(1);
      const grp = cg && cg[0];
      setCombo(
        grp
          ? {
              id: grp.id,
              min_select: grp.min_select,
              max_select: grp.max_select,
              items: (grp.combo_group_items || []).map((it: any) => ({
                child_menu_id: it.child_menu_id,
                upgrade_price_delta: Number(it.upgrade_price_delta || 0),
                is_default: !!it.is_default,
              })),
            }
          : { items: [] }
      );
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---------- INGREDIENTS ----------
  const toggleIngredient = (ingredient_id: string) => {
    setIngCfg((list) =>
      list.find((x) => x.ingredient_id === ingredient_id)
        ? list.filter((x) => x.ingredient_id !== ingredient_id)
        : [
            ...list,
            {
              ingredient_id,
              removable: true,
              extra_available: true,
              max_extra: 1,
              extra_price_override: null,
            },
          ]
    );
  };

  const saveIngredients = async () => {
    setSaving(true);
    try {
      // clear then insert current config
      await supabase.from("menu_ingredients").delete().eq("menu_id", menuId);
      if (ingCfg.length) {
        await supabase
          .from("menu_ingredients")
          .insert(ingCfg.map((r) => ({ menu_id: menuId, ...r })));
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- MODIFIER GROUPS ----------
  const addGroup = () =>
    setGroups((g) => [
      ...g,
      {
        name_en: "New group",
        selection_type: "single",
        min_select: 0,
        max_select: 1,
        required: false,
        options: [],
      },
    ]);
  const removeGroup = (i: number) =>
    setGroups((g) => g.filter((_, idx) => idx !== i));
  const addOption = (gi: number) =>
    setGroups((g) =>
      g.map((gr, idx) =>
        idx === gi
          ? {
              ...gr,
              options: [...gr.options, { name_en: "Option", price_delta: 0 }],
            }
          : gr
      )
    );
  const removeOption = (gi: number, oi: number) =>
    setGroups((g) =>
      g.map((gr, idx) =>
        idx === gi
          ? { ...gr, options: gr.options.filter((_, j) => j !== oi) }
          : gr
      )
    );

  const saveGroups = async () => {
    setSaving(true);
    try {
      // upsert groups, collect ids
      const groupIds: string[] = [];
      for (const gr of groups) {
        let gid = gr.id;
        if (!gid) {
          const { data, error } = await supabase
            .from("modifier_groups")
            .insert([
              {
                name_en: gr.name_en,
                name_ar: gr.name_ar ?? null,
                selection_type: gr.selection_type,
                min_select: gr.min_select ?? null,
                max_select: gr.max_select ?? null,
                required: !!gr.required,
              },
            ])
            .select("id")
            .single();
          if (error) throw error;
          gid = data.id;
        } else {
          const { error } = await supabase
            .from("modifier_groups")
            .update({
              name_en: gr.name_en,
              name_ar: gr.name_ar ?? null,
              selection_type: gr.selection_type,
              min_select: gr.min_select ?? null,
              max_select: gr.max_select ?? null,
              required: !!gr.required,
            })
            .eq("id", gid);
          if (error) throw error;
        }
        groupIds.push(gid!);

        // replace options of this group
        await supabase.from("modifier_options").delete().eq("group_id", gid);
        if (gr.options.length) {
          await supabase.from("modifier_options").insert(
            gr.options.map((o) => ({
              group_id: gid,
              name_en: o.name_en,
              name_ar: o.name_ar ?? null,
              price_delta: o.price_delta ?? 0,
              max_qty: o.max_qty ?? null,
              is_default: !!o.is_default,
            }))
          );
        }
      }

      // link menu -> groups (reset and insert)
      await supabase
        .from("menu_modifier_groups")
        .delete()
        .eq("menu_id", menuId);
      if (groupIds.length) {
        await supabase
          .from("menu_modifier_groups")
          .insert(groupIds.map((id) => ({ menu_id: menuId, group_id: id })));
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- COMBO ----------
  const addChild = () =>
    setCombo((c) => ({
      ...c,
      items: [...c.items, { child_menu_id: "", upgrade_price_delta: 0 }],
    }));
  const removeChild = (idx: number) =>
    setCombo((c) => ({ ...c, items: c.items.filter((_, i) => i !== idx) }));

  const saveCombo = async () => {
    setSaving(true);
    try {
      let groupId = combo.id;
      if (!groupId) {
        const { data, error } = await supabase
          .from("combo_groups")
          .insert([
            {
              menu_id: menuId,
              min_select: combo.min_select ?? 0,
              max_select: combo.max_select ?? 1,
            },
          ])
          .select("id")
          .single();
        if (error) throw error;
        groupId = data.id;
      } else {
        const { error } = await supabase
          .from("combo_groups")
          .update({
            min_select: combo.min_select ?? 0,
            max_select: combo.max_select ?? 1,
          })
          .eq("id", groupId);
        if (error) throw error;
      }
      // replace items
      await supabase.from("combo_group_items").delete().eq("group_id", groupId);
      if (combo.items.length) {
        await supabase.from("combo_group_items").insert(
          combo.items
            .filter((it) => it.child_menu_id)
            .map((it) => ({
              group_id: groupId!,
              child_menu_id: it.child_menu_id,
              is_default: !!it.is_default,
              upgrade_price_delta: it.upgrade_price_delta ?? 0,
            }))
        );
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-3 text-sm">Loading options…</div>;
  if (error) return <div className="p-3 text-sm text-red-600">{error}</div>;

  return (
    <div className="mt-6">
      <div className="flex gap-2 mb-3">
        {(["ingredients", "options", "combo"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-xl text-sm border ${
              tab === k
                ? "bg-emerald-600 text-white border-emerald-600"
                : "border-slate-300"
            }`}
          >
            {k === "ingredients"
              ? "Ingredients"
              : k === "options"
              ? "Modifier Groups"
              : "Combo"}
          </button>
        ))}
      </div>

      {tab === "ingredients" && (
        <div className="rounded-xl border p-3 space-y-2">
          {allIngredients.map((ing) => {
            const row = ingCfg.find((x) => x.ingredient_id === ing.id);
            return (
              <div
                key={ing.id}
                className="grid grid-cols-12 items-center gap-2 py-2 border-b last:border-0"
              >
                <div className="col-span-3 text-sm">{ing.name_en}</div>
                <div className="col-span-1 text-right">
                  <input
                    type="checkbox"
                    checked={!!row}
                    onChange={() => toggleIngredient(ing.id)}
                  />
                </div>
                <div className="col-span-2 text-xs text-slate-500">
                  base +{Number(ing.extra_price || 0).toFixed(2)}
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <label className="text-xs">Removable</label>
                  <input
                    type="checkbox"
                    disabled={!row}
                    checked={!!row?.removable}
                    onChange={(e) =>
                      setIngCfg((list) =>
                        list.map((r) =>
                          r.ingredient_id === ing.id
                            ? { ...r, removable: e.target.checked }
                            : r
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <label className="text-xs">Extra</label>
                  <input
                    type="checkbox"
                    disabled={!row}
                    checked={!!row?.extra_available}
                    onChange={(e) =>
                      setIngCfg((list) =>
                        list.map((r) =>
                          r.ingredient_id === ing.id
                            ? { ...r, extra_available: e.target.checked }
                            : r
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <label className="text-xs">Max</label>
                  <input
                    type="number"
                    min={0}
                    className="w-16 px-2 py-1 rounded border"
                    disabled={!row}
                    value={row?.max_extra ?? 0}
                    onChange={(e) =>
                      setIngCfg((list) =>
                        list.map((r) =>
                          r.ingredient_id === ing.id
                            ? { ...r, max_extra: Number(e.target.value || 0) }
                            : r
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <label className="text-xs">Override +</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-24 px-2 py-1 rounded border"
                    disabled={!row}
                    value={row?.extra_price_override ?? ""}
                    onChange={(e) =>
                      setIngCfg((list) =>
                        list.map((r) =>
                          r.ingredient_id === ing.id
                            ? {
                                ...r,
                                extra_price_override:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : r
                        )
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
          <div className="pt-3">
            <button
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
              onClick={saveIngredients}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save ingredients"}
            </button>
          </div>
        </div>
      )}

      {tab === "options" && (
        <div className="rounded-xl border p-3 space-y-3">
          {groups.map((g, gi) => (
            <div key={gi} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <input
                  className="px-2 py-1 rounded border flex-1"
                  value={g.name_en}
                  onChange={(e) =>
                    setGroups((list) =>
                      list.map((x, i) =>
                        i === gi ? { ...x, name_en: e.target.value } : x
                      )
                    )
                  }
                />
                <select
                  className="px-2 py-1 rounded border"
                  value={g.selection_type}
                  onChange={(e) =>
                    setGroups((list) =>
                      list.map((x, i) =>
                        i === gi
                          ? {
                              ...x,
                              selection_type: e.target.value as any,
                              max_select:
                                e.target.value === "single" ? 1 : x.max_select,
                            }
                          : x
                      )
                    )
                  }
                >
                  <option value="single">single</option>
                  <option value="multi">multi</option>
                </select>
                <label className="text-xs ml-2">
                  required{" "}
                  <input
                    type="checkbox"
                    checked={!!g.required}
                    onChange={(e) =>
                      setGroups((list) =>
                        list.map((x, i) =>
                          i === gi ? { ...x, required: e.target.checked } : x
                        )
                      )
                    }
                  />
                </label>
                <button
                  className="ml-auto text-red-600"
                  onClick={() => removeGroup(gi)}
                >
                  <Trash2 />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs">
                  min
                  <select
                    className="ml-2 px-2 py-1 rounded border"
                    value={g.min_select ?? 0}
                    onChange={(e) =>
                      setGroups((list) =>
                        list.map((x, i) =>
                          i === gi
                            ? { ...x, min_select: Number(e.target.value) }
                            : x
                        )
                      )
                    }
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  max
                  <select
                    className="ml-2 px-2 py-1 rounded border"
                    value={
                      g.max_select ?? (g.selection_type === "single" ? 1 : 1)
                    }
                    onChange={(e) =>
                      setGroups((list) =>
                        list.map((x, i) =>
                          i === gi
                            ? { ...x, max_select: Number(e.target.value) }
                            : x
                        )
                      )
                    }
                  >
                    {[1, 2, 3, 4, 5, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <div className="text-xs font-medium mb-1">Options</div>
                <div className="space-y-2">
                  {g.options.map((o, oi) => (
                    <div
                      key={oi}
                      className="grid grid-cols-12 items-center gap-2"
                    >
                      <input
                        className="col-span-4 px-2 py-1 rounded border"
                        value={o.name_en}
                        onChange={(e) =>
                          setGroups((list) =>
                            list.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    options: x.options.map((oo, j) =>
                                      j === oi
                                        ? { ...oo, name_en: e.target.value }
                                        : oo
                                    ),
                                  }
                                : x
                            )
                          )
                        }
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="col-span-3 px-2 py-1 rounded border"
                        value={o.price_delta ?? 0}
                        onChange={(e) =>
                          setGroups((list) =>
                            list.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    options: x.options.map((oo, j) =>
                                      j === oi
                                        ? {
                                            ...oo,
                                            price_delta: Number(
                                              e.target.value || 0
                                            ),
                                          }
                                        : oo
                                    ),
                                  }
                                : x
                            )
                          )
                        }
                      />
                      <label className="col-span-3 text-xs">
                        max qty{" "}
                        <input
                          type="number"
                          min={1}
                          className="ml-2 w-20 px-2 py-1 rounded border"
                          value={o.max_qty ?? ""}
                          onChange={(e) =>
                            setGroups((list) =>
                              list.map((x, i) =>
                                i === gi
                                  ? {
                                      ...x,
                                      options: x.options.map((oo, j) =>
                                        j === oi
                                          ? {
                                              ...oo,
                                              max_qty:
                                                e.target.value === ""
                                                  ? null
                                                  : Number(e.target.value),
                                            }
                                          : oo
                                      ),
                                    }
                                  : x
                              )
                            )
                          }
                        />
                      </label>
                      <button
                        className="col-span-2 text-red-600"
                        onClick={() => removeOption(gi, oi)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 px-3 py-1.5 rounded border"
                  onClick={() => addOption(gi)}
                >
                  <Plus className="inline w-4 h-4 mr-1" />
                  Add option
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded-xl border" onClick={addGroup}>
              <Plus className="inline w-4 h-4 mr-1" />
              Add group
            </button>
            <button
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
              onClick={saveGroups}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save groups"}
            </button>
          </div>
        </div>
      )}

      {tab === "combo" && (
        <div className="rounded-xl border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              min
              <select
                className="ml-2 px-2 py-1 rounded border"
                value={combo.min_select ?? 0}
                onChange={(e) =>
                  setCombo((c) => ({
                    ...c,
                    min_select: Number(e.target.value),
                  }))
                }
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              max
              <select
                className="ml-2 px-2 py-1 rounded border"
                value={combo.max_select ?? 1}
                onChange={(e) =>
                  setCombo((c) => ({
                    ...c,
                    max_select: Number(e.target.value),
                  }))
                }
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            {combo.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2">
                <select
                  className="col-span-6 px-2 py-1 rounded border"
                  value={it.child_menu_id}
                  onChange={(e) =>
                    setCombo((c) => ({
                      ...c,
                      items: c.items.map((x, i) =>
                        i === idx ? { ...x, child_menu_id: e.target.value } : x
                      ),
                    }))
                  }
                >
                  <option value="">Select child menu…</option>
                  {allMenus
                    .filter((m) => m.id !== menuId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name_en}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="col-span-4 px-2 py-1 rounded border"
                  value={it.upgrade_price_delta ?? 0}
                  onChange={(e) =>
                    setCombo((c) => ({
                      ...c,
                      items: c.items.map((x, i) =>
                        i === idx
                          ? {
                              ...x,
                              upgrade_price_delta: Number(e.target.value || 0),
                            }
                          : x
                      ),
                    }))
                  }
                />
                <button
                  className="col-span-2 text-red-600"
                  onClick={() => removeChild(idx)}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button className="px-3 py-1.5 rounded border" onClick={addChild}>
              <Plus className="inline w-4 h-4 mr-1" />
              Add child
            </button>
            <button
              className="px-3 py-1.5 rounded bg-emerald-600 text-white"
              onClick={saveCombo}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save combo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

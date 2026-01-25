import React, { useEffect, useMemo, useState } from "react";
import type {
  OrderFlowRules,
  OrderStatusKey,
  OrderStatusDef,
} from "../../order-admin/types";
import { DEFAULT_FLOW } from "../../order-admin/defaults";
import { adminService } from "../../services/adminService";
import { toast } from "react-hot-toast";

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-sm border bg-white ${className}`}
    >
      {children}
    </span>
  );
}
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-3 py-2">
      <div className="col-span-4 text-sm text-slate-700">{label}</div>
      <div className="col-span-8">{children}</div>
    </div>
  );
}

export default function OrderWorkflowRules({ adminId }: { adminId: string }) {
  const [flow, setFlow] = useState<OrderFlowRules>(DEFAULT_FLOW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const settings = await adminService.getAdminSettings(adminId);
        const incoming: OrderFlowRules | undefined = settings?.order_rules;
        setFlow(
          incoming && Object.keys(incoming).length ? incoming : DEFAULT_FLOW
        );
        setDirty(false);
      } catch (e) {
        console.error(e);
        setFlow(DEFAULT_FLOW);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [adminId]);

  const statusKeys = useMemo(() => flow.statuses.map((s) => s.key), [flow]);

  const updateStatus = (
    key: OrderStatusKey,
    patch: Partial<OrderStatusDef>
  ) => {
    setFlow((prev) => ({
      ...prev,
      statuses: prev.statuses.map((s) =>
        s.key === key ? { ...s, ...patch } : s
      ),
    }));
    setDirty(true);
  };

  const reorder = (from: number, to: number) => {
    setFlow((prev) => {
      const copy = [...prev.statuses];
      const [m] = copy.splice(from, 1);
      copy.splice(to, 0, m);
      return { ...prev, statuses: copy };
    });
    setDirty(true);
  };

  const toggleTransition = (from: OrderStatusKey, to: OrderStatusKey) => {
    setFlow((prev) => {
      const nexts = new Set(prev.transitions[from]);
      if (nexts.has(to)) nexts.delete(to);
      else nexts.add(to);
      return {
        ...prev,
        transitions: {
          ...prev.transitions,
          [from]: Array.from(nexts) as OrderStatusKey[],
        },
      };
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminService.saveOrderRules(adminId, flow);
      setDirty(false);
      toast.success("Order workflow rules saved");
    } catch (e: any) {
      toast.error("Failed to save: " + e?.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="p-6 rounded-xl border bg-white">Loading order rules…</div>
    );

  return (
    <section className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Order Workflow Rules
          </h3>
          <p className="text-slate-600 text-sm">
            Define statuses, transitions, and SLAs. These apply across Menu,
            KDS, and Receipts.
          </p>
        </div>
      </header>

      {/* Status list */}
      <div className="space-y-3">
        <h4 className="font-medium text-slate-800">Statuses</h4>
        <div className="divide-y border rounded-xl">
          {flow.statuses.map((s, i) => (
            <div
              key={s.key}
              className="grid grid-cols-12 gap-3 items-center p-3"
            >
              <div className="col-span-2 flex items-center gap-2">
                <button
                  className="w-8 h-8 rounded-md border bg-white disabled:opacity-40"
                  onClick={() => reorder(i, Math.max(0, i - 1))}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="w-8 h-8 rounded-md border bg-white disabled:opacity-40"
                  onClick={() =>
                    reorder(i, Math.min(flow.statuses.length - 1, i + 1))
                  }
                  disabled={i === flow.statuses.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <Chip>{s.key}</Chip>
              </div>
              <div className="col-span-4 flex items-center gap-2">
                <input
                  className="w-full border rounded-md px-2 py-1"
                  value={s.label_en}
                  onChange={(e) =>
                    updateStatus(s.key, { label_en: e.target.value })
                  }
                  placeholder="Label (EN)"
                />
                <input
                  className="w-full border rounded-md px-2 py-1"
                  value={s.label_ar}
                  onChange={(e) =>
                    updateStatus(s.key, { label_ar: e.target.value })
                  }
                  placeholder="Label (AR)"
                />
              </div>
              <div className="col-span-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!s.customerVisible}
                    onChange={(e) =>
                      updateStatus(s.key, { customerVisible: e.target.checked })
                    }
                  />
                  Customer visible
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!s.notify}
                    onChange={(e) =>
                      updateStatus(s.key, { notify: e.target.checked })
                    }
                  />
                  Notify
                </label>
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <span className="text-sm text-slate-600">SLA (min)</span>
                <input
                  type="number"
                  min={0}
                  className="w-24 border rounded-md px-2 py-1 text-right"
                  value={s.slaMin ?? 0}
                  onChange={(e) =>
                    updateStatus(s.key, {
                      slaMin: Math.max(0, Number(e.target.value || 0)),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transitions matrix */}
      <div className="space-y-3">
        <h4 className="font-medium text-slate-800">Allowed Transitions</h4>
        <div className="overflow-auto border rounded-xl">
          <table className="min-w-[640px] w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700">
                <th className="p-2 text-left">From ↓ / To →</th>
                {statusKeys.map((k) => (
                  <th key={k} className="p-2">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statusKeys.map((from) => (
                <tr key={from} className="border-t">
                  <td className="p-2 font-medium text-slate-800">
                    <Chip>{from}</Chip>
                  </td>
                  {statusKeys.map((to) => (
                    <td key={from + to} className="p-2 text-center">
                      {from === to ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={
                            flow.transitions[from]?.includes(
                              to as OrderStatusKey
                            ) || false
                          }
                          onChange={() =>
                            toggleTransition(
                              from as OrderStatusKey,
                              to as OrderStatusKey
                            )
                          }
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global rules */}
      <div className="space-y-2">
        <Row label="Auto-cancel PENDING after (min)">
          <input
            type="number"
            min={0}
            className="w-28 border rounded-md px-2 py-1 text-right"
            value={flow.autoCancelAfterMin ?? 0}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value || 0));
              setFlow((p) => ({ ...p, autoCancelAfterMin: v }));
              setDirty(true);
            }}
          />
        </Row>
      </div>

      <footer className="pt-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium border shadow-sm ${
            dirty
              ? "bg-emerald-600 text-white border-emerald-700"
              : "bg-slate-100 text-slate-500 border-slate-200"
          }`}
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </footer>
    </section>
  );
}

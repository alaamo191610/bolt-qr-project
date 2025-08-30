'use client'
import React, { useEffect, useState } from 'react'
import type { KDSPrefs, OrderStatusKey } from '../../order-admin/types'
import { DEFAULT_KDS } from '../../order-admin/defaults'
import { adminService } from '../../services/adminService'


function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
      <select className="border rounded-md px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    )
  }
  function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
    )
  }
  
  export default function KDSSettings({ adminId }: { adminId: string }) {
    const [prefs, setPrefs] = useState<KDSPrefs>(DEFAULT_KDS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
  
    useEffect(() => {
      let mounted = true
      ;(async () => {
        setLoading(true)
        try {
        const settings = await adminService.getAdminSettings(adminId)
          const incoming: KDSPrefs | undefined = settings?.kds_prefs
          setPrefs(incoming && Object.keys(incoming).length ? incoming : DEFAULT_KDS)
          setDirty(false)
        } catch (e) {
          console.error(e)
          setPrefs(DEFAULT_KDS)
        } finally {
          if (mounted) setLoading(false)
        }
      })()
      return () => {
        mounted = false
      }
    }, [adminId])
  
    const statusOptions: OrderStatusKey[] = ['pending', 'preparing', 'ready', 'served', 'cancelled']
  
    const moveCol = (from: number, to: number) => {
      setPrefs((p) => {
        const copy = [...p.columns]
        const [m] = copy.splice(from, 1)
        copy.splice(to, 0, m)
        return { ...p, columns: copy }
      })
      setDirty(true)
    }
  
    const save = async () => {
      setSaving(true)
      try {
        await adminService.saveKDSPrefs(adminId, prefs)
        setDirty(false)
      } catch (e:any) {
        alert('Failed to save: ' + e?.message)
      } finally {
        setSaving(false)
      }
    }
  
    if (loading) return <div className="p-6 rounded-xl border bg-white">Loading KDS settings…</div>
  
    return (
      <section className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Kitchen Display Settings</h3>
            <p className="text-slate-600 text-sm">Control how tickets show in the kitchen and auto-advance behavior.</p>
          </div>
        </header>
  
        {/* Columns (dragless reorder) */}
        <div>
          <h4 className="font-medium text-slate-800 mb-2">Columns</h4>
          <div className="flex flex-wrap items-center gap-2">
            {prefs.columns.map((c, i) => (
              <span key={c + i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-white">
                {c}
                <div className="flex">
                  <button
                    aria-label="Move left"
                    className="ml-1 w-6 h-6 rounded border"
                    onClick={() => moveCol(i, Math.max(0, i - 1))}
                    disabled={i === 0}
                  >
                    ←
                  </button>
                  <button
                    aria-label="Move right"
                    className="ml-1 w-6 h-6 rounded border"
                    onClick={() => moveCol(i, Math.min(prefs.columns.length - 1, i + 1))}
                    disabled={i === prefs.columns.length - 1}
                  >
                    →
                  </button>
                </div>
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">Visible statuses (left→right). You can include/exclude any of: {statusOptions.join(', ')}.</div>
        </div>
  
        {/* Sounds & bump */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6 space-y-3">
            <Toggle
              checked={prefs.soundEnabled}
              onChange={(v) => {
                setPrefs((p) => ({ ...p, soundEnabled: v }))
                setDirty(true)
              }}
              label="Enable sound alerts"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Sound preset</span>
              <Select
                value={prefs.soundPreset}
                onChange={(v) => {
                  setPrefs((p) => ({ ...p, soundPreset: v as KDSPrefs['soundPreset'] }))
                  setDirty(true)
                }}
              >
                <option value="ding">ding</option>
                <option value="bell">bell</option>
                <option value="knock">knock</option>
                <option value="beep">beep</option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Auto-bump after (min)</span>
              <input
                type="number"
                min={0}
                className="w-24 border rounded-md px-2 py-1 text-right"
                value={prefs.autoBumpMinutes}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value || 0))
                  setPrefs((p) => ({ ...p, autoBumpMinutes: v }))
                  setDirty(true)
                }}
              />
            </div>
          </div>
          <div className="col-span-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Ticket scale</span>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={prefs.ticketScale}
                onChange={(e) => {
                  setPrefs((p) => ({ ...p, ticketScale: Number(e.target.value) }))
                  setDirty(true)
                }}
              />
              <span className="text-sm tabular-nums">{prefs.ticketScale.toFixed(2)}x</span>
            </div>
            <Toggle
              checked={prefs.showModifiersLarge}
              onChange={(v) => {
                setPrefs((p) => ({ ...p, showModifiersLarge: v }))
                setDirty(true)
              }}
              label="Show modifiers large"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Color scheme</span>
              <Select
                value={prefs.colorScheme}
                onChange={(v) => {
                  setPrefs((p) => ({ ...p, colorScheme: v as KDSPrefs['colorScheme'] }))
                  setDirty(true)
                }}
              >
                <option value="light">light</option>
                <option value="dark">dark</option>
                <option value="high-contrast">high-contrast</option>
              </Select>
            </div>
          </div>
        </div>
  
        {/* Ticket grouping */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Group tickets</span>
          <Select
            value={prefs.ticketGrouping}
            onChange={(v) => {
              setPrefs((p) => ({ ...p, ticketGrouping: v as KDSPrefs['ticketGrouping'] }))
              setDirty(true)
            }}
          >
            <option value="none">none</option>
            <option value="byTable">byTable</option>
            <option value="byCourse">byCourse</option>
          </Select>
        </div>
  
        {/* Prep time colors */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6 flex items-center gap-2">
            <span className="text-sm text-slate-600">OK ≤</span>
            <input
              type="number"
              min={1}
              className="w-20 border rounded-md px-2 py-1 text-right"
              value={prefs.prepTimeColors.ok}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value || 1))
                setPrefs((p) => ({ ...p, prepTimeColors: { ...p.prepTimeColors, ok: v } }))
                setDirty(true)
              }}
            />
            <span className="text-sm text-slate-600">min</span>
          </div>
          <div className="col-span-6 flex items-center gap-2">
            <span className="text-sm text-slate-600">Warn ≤</span>
            <input
              type="number"
              min={1}
              className="w-20 border rounded-md px-2 py-1 text-right"
              value={prefs.prepTimeColors.warn}
              onChange={(e) => {
                const v = Math.max(prefs.prepTimeColors.ok + 1, Number(e.target.value || prefs.prepTimeColors.ok + 1))
                setPrefs((p) => ({ ...p, prepTimeColors: { ...p.prepTimeColors, warn: v } }))
                setDirty(true)
              }}
            />
            <span className="text-sm text-slate-600">min</span>
          </div>
        </div>
  
        <footer className="pt-2">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium border shadow-sm ${dirty ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
          >
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </footer>
      </section>
    )
  }
  
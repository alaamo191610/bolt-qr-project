import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlayCircle, PauseCircle, XCircle, Flame, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../providers/AuthProvider';
import { tokenStore } from '../../services/api';
import { decodeJwtPayload } from '../../utils/jwt';
import { orderingStateService, type OrderingState } from '../../services/orderingStateService';
import { getErrorMessage } from '../../utils/errors';

const STATES: {
  value: OrderingState;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
}[] = [
  {
    value: 'OPEN',
    labelKey: 'orderingState.open',
    descriptionKey: 'orderingState.openDescription',
    icon: PlayCircle,
    activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-300',
  },
  {
    value: 'PAUSED',
    labelKey: 'orderingState.paused',
    descriptionKey: 'orderingState.pausedDescription',
    icon: PauseCircle,
    activeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/25 dark:text-amber-300',
  },
  {
    value: 'CLOSED',
    labelKey: 'orderingState.closed',
    descriptionKey: 'orderingState.closedDescription',
    icon: XCircle,
    activeClass: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/25 dark:text-rose-300',
  },
  {
    value: 'OVERLOADED',
    labelKey: 'orderingState.overloaded',
    descriptionKey: 'orderingState.overloadedDescription',
    icon: Flame,
    activeClass: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700/60 dark:bg-orange-900/25 dark:text-orange-300',
  },
];

const CONFIRM_BODY_KEY: Partial<Record<OrderingState, string>> = {
  PAUSED: 'orderingState.confirmPausedBody',
  CLOSED: 'orderingState.confirmClosedBody',
  OVERLOADED: 'orderingState.confirmOverloadedBody',
};

const OrderingStatusControl: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [state, setState] = useState<OrderingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingState, setPendingState] = useState<OrderingState | null>(null);

  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';

  // Read-only claim decode for UI convenience; the server independently
  // verifies and authorizes every real request against this branch.
  const branchId = useMemo(() => {
    const token = tokenStore.get('restaurant');
    if (!token) return null;
    const claims = decodeJwtPayload<{ branchId?: string | null }>(token);
    return claims?.branchId || null;
  }, []);

  const load = useCallback(async () => {
    if (!branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await orderingStateService.get(branchId);
      setState(result.state);
    } catch (err) {
      setError(getErrorMessage(err, t('orderingState.loadError')));
    } finally {
      setLoading(false);
    }
    // `t` is intentionally omitted: LanguageProvider doesn't memoize it, so
    // including it would recreate this callback (and retrigger the load
    // effect) on every language-context render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
  }, [canManage, load]);

  // Neither a STAFF member nor a legacy admin without a resolvable branch
  // can act on this - the server rejects both, so there is nothing useful
  // to render (no read-only view either: GET requires OWNER/MANAGER too).
  if (!canManage || !branchId) return null;

  const applyState = async (next: OrderingState) => {
    setPendingState(null);
    setSaving(true);
    const previous = state;
    setState(next);
    try {
      const result = await orderingStateService.set(branchId, next);
      setState(result.state);
      toast.success(t('orderingState.updateSuccess'));
    } catch (err) {
      setState(previous);
      toast.error(getErrorMessage(err, t('orderingState.updateError')));
    } finally {
      setSaving(false);
    }
  };

  const requestChange = (next: OrderingState) => {
    if (next === state || saving) return;
    // Reopening is always safe to apply immediately; leaving OPEN affects
    // live customers and gets a confirmation first.
    if (next === 'OPEN') {
      void applyState(next);
      return;
    }
    setPendingState(next);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-lg border border-slate-200/50 dark:border-slate-700/50 p-6">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('orderingState.title')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('orderingState.subtitle')}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-hidden="true">
          {STATES.map((s) => (
            <div key={s.value} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button
            onClick={() => void load()}
            className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
          >
            {t('status.tryAgain')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATES.map((s) => {
            const Icon = s.icon;
            const isActive = state === s.value;
            return (
              <button
                key={s.value}
                onClick={() => requestChange(s.value)}
                disabled={saving}
                aria-pressed={isActive}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-4 text-center transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isActive
                    ? `${s.activeClass} shadow-sm`
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-sm font-bold">{t(s.labelKey)}</span>
                <span className="text-[11px] leading-tight opacity-80">{t(s.descriptionKey)}</span>
              </button>
            );
          })}
        </div>
      )}

      {pendingState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scale-in text-center">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {t('orderingState.confirmTitle', {
                state: t(STATES.find((s) => s.value === pendingState)?.labelKey || ''),
              })}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              {t(CONFIRM_BODY_KEY[pendingState] || '')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingState(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
              >
                {t('orderingState.confirmCancel')}
              </button>
              <button
                onClick={() => void applyState(pendingState)}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/30 transition-all"
              >
                {t('orderingState.confirmConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderingStatusControl;

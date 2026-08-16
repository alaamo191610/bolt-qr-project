import React, { useMemo, useState } from 'react';
import { Check, Copy, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  superAdminService,
  type RestaurantInvitationResponse,
  type SubscriptionPlan,
} from '../../services/superAdminService';
import { getErrorMessage } from '../../utils/errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

const RestaurantProvisioningModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const [ownerEmail, setOwnerEmail] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('STANDARD');
  const [status, setStatus] = useState<'ACTIVE' | 'TRIAL'>('TRIAL');
  const [endDate, setEndDate] = useState(tomorrow());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<RestaurantInvitationResponse | null>(null);
  const activationUrl = useMemo(() => created
    ? `${window.location.origin}${created.invitation.activationPath}`
    : '', [created]);

  if (!isOpen) return null;

  const close = () => {
    setCreated(null);
    setOwnerEmail('');
    setRestaurantName('');
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await superAdminService.provisionRestaurant({
        ownerEmail,
        restaurantName,
        plan,
        status,
        ...(status === 'TRIAL' ? { trialEndsAt: new Date(`${endDate}T23:59:59.999Z`).toISOString() }
          : endDate ? { subscriptionEnd: new Date(`${endDate}T23:59:59.999Z`).toISOString() } : {}),
      });
      setCreated(response);
      await onCreated();
      toast.success('Restaurant created. Share the activation link securely.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create restaurant'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(activationUrl);
    toast.success('Activation link copied');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="provision-title">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="provision-title" className="text-2xl font-bold text-slate-900 dark:text-white">Create restaurant access</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The owner sets their password from a one-time 48-hour link.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700"><X /></button>
        </div>

        {created ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="mb-2 flex items-center gap-2 font-semibold"><Check className="h-5 w-5" /> Restaurant provisioned</div>
              <p className="text-sm">{created.restaurant.restaurantName} — {created.restaurant.ownerEmail}</p>
            </div>
            <div>
              <label htmlFor="activation-link" className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">One-time activation link</label>
              <div className="flex gap-2">
                <input id="activation-link" readOnly value={activationUrl} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white"><Copy className="h-4 w-4" /> Copy</button>
              </div>
              <p className="mt-2 text-xs text-amber-700">This secret is shown only in this response. Send it through a trusted channel.</p>
            </div>
            <button type="button" onClick={close} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="restaurant-name" className="mb-1 block text-sm font-medium">Restaurant name</label>
              <input id="restaurant-name" required minLength={2} maxLength={120} value={restaurantName} onChange={event => setRestaurantName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label htmlFor="owner-email" className="mb-1 block text-sm font-medium">Owner email</label>
              <input id="owner-email" required type="email" maxLength={254} value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="subscription-plan" className="mb-1 block text-sm font-medium">Plan</label>
                <select id="subscription-plan" value={plan} onChange={event => setPlan(event.target.value as SubscriptionPlan)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="STANDARD">Standard</option><option value="BASIC">Basic</option><option value="PRO">Pro</option>
                </select>
              </div>
              <div>
                <label htmlFor="subscription-status" className="mb-1 block text-sm font-medium">Starts as</label>
                <select id="subscription-status" value={status} onChange={event => setStatus(event.target.value as 'ACTIVE' | 'TRIAL')} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="TRIAL">Trial</option><option value="ACTIVE">Active</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="access-end" className="mb-1 block text-sm font-medium">{status === 'TRIAL' ? 'Trial ends' : 'Subscription ends (optional)'}</label>
              <input id="access-end" type="date" required={status === 'TRIAL'} min={tomorrow()} value={endDate} onChange={event => setEndDate(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 font-medium text-white disabled:opacity-60"><Plus className="h-5 w-5" />{submitting ? 'Creating…' : 'Create and generate invitation'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RestaurantProvisioningModal;

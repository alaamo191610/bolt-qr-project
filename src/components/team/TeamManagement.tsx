import React, { useCallback, useEffect, useState } from 'react';
import { UserCog, Plus, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../providers/AuthProvider';
import {
  memberService,
  type OrganizationMember,
  type MemberRole,
  type MemberStatus,
  type UpdateMemberInput,
} from '../../services/memberService';
import { getErrorMessage } from '../../utils/errors';

const ROLE_STYLES: Record<MemberRole, string> = {
  OWNER: 'bg-violet-100/50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700/50',
  MANAGER: 'bg-blue-100/50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50',
  STAFF: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
};

const STATUS_STYLES: Record<MemberStatus, string> = {
  ACTIVE: 'bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50',
  INVITED: 'bg-amber-100/50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50',
  SUSPENDED: 'bg-rose-100/50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/50',
};

const ROLE_ORDER: MemberRole[] = ['OWNER', 'MANAGER', 'STAFF'];
const STATUS_ORDER: MemberStatus[] = ['ACTIVE', 'INVITED', 'SUSPENDED'];

const TeamManagement: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', name: '', password: '', role: 'STAFF' as MemberRole });
  const [pendingSuspend, setPendingSuspend] = useState<OrganizationMember | null>(null);

  const isOwner = user?.role === 'OWNER';
  const canAdd = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const assignableRoles: MemberRole[] = isOwner ? ROLE_ORDER : ['MANAGER', 'STAFF'];

  const roleLabel = (role: MemberRole): string => ({
    OWNER: t('team.roleOwner'),
    MANAGER: t('team.roleManager'),
    STAFF: t('team.roleStaff'),
  }[role]);

  const statusLabel = (status: MemberStatus): string => ({
    ACTIVE: t('team.statusActive'),
    INVITED: t('team.statusInvited'),
    SUSPENDED: t('team.statusSuspended'),
  }[status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await memberService.list();
      setMembers(list);
    } catch (err) {
      setError(getErrorMessage(err, t('team.loadError')));
    } finally {
      setLoading(false);
    }
    // `t` is intentionally omitted: LanguageProvider doesn't memoize it, so
    // including it would recreate this callback (and retrigger the load
    // effect) on every language-context render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canAdd) void load();
    else setLoading(false);
  }, [canAdd, load]);

  // Neither role that can't see the member list (STAFF) nor a legacy admin
  // without a resolvable membership can act here - the server rejects both,
  // so there is nothing useful to render.
  if (!canAdd) return null;

  const updateMember = async (member: OrganizationMember, patch: UpdateMemberInput) => {
    setSavingUserId(member.userId);
    const previous = members;
    setMembers(prev => prev.map(m => (m.userId === member.userId ? { ...m, ...patch } : m)));
    try {
      const updated = await memberService.update(member.userId, patch);
      setMembers(prev => prev.map(m => (m.userId === member.userId ? updated : m)));
      toast.success(t('team.updateSuccess'));
    } catch (err) {
      setMembers(previous);
      toast.error(getErrorMessage(err, t('team.updateError')));
    } finally {
      setSavingUserId(null);
    }
  };

  const onRoleChange = (member: OrganizationMember, role: MemberRole) => {
    if (role === member.role || savingUserId) return;
    void updateMember(member, { role });
  };

  const onStatusChange = (member: OrganizationMember, status: MemberStatus) => {
    if (status === member.status || savingUserId) return;
    if (status === 'SUSPENDED') {
      setPendingSuspend(member);
      return;
    }
    void updateMember(member, { status });
  };

  const confirmSuspend = () => {
    if (!pendingSuspend) return;
    const member = pendingSuspend;
    setPendingSuspend(null);
    void updateMember(member, { status: 'SUSPENDED' });
  };

  const resetAddForm = () => setAddForm({ email: '', name: '', password: '', role: 'STAFF' });

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.email.trim() || addSaving) return;
    setAddSaving(true);
    try {
      const created = await memberService.add({
        email: addForm.email.trim(),
        name: addForm.name.trim() || undefined,
        password: addForm.password || undefined,
        role: addForm.role,
      });
      setMembers(prev => [...prev, created]);
      toast.success(t('team.addSuccess'));
      setShowAddModal(false);
      resetAddForm();
    } catch (err) {
      toast.error(getErrorMessage(err, t('team.addError')));
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in p-2">
      <div className="bg-white/90 dark:bg-slate-800/90 rounded-3xl shadow-lg border border-slate-200/50 dark:border-slate-700/50 p-6 sticky top-4 z-20 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <UserCog className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t('team.title')}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                {t('team.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="group flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 active:scale-95"
          >
            <div className="w-6 h-6 rounded-lg bg-white/20 dark:bg-black/10 flex items-center justify-center group-hover:bg-white/30 dark:group-hover:bg-black/20 transition-colors">
              <Plus className="w-4 h-4" />
            </div>
            <span>{t('team.addMember')}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
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
      ) : members.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/50 dark:border-slate-700/50">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <UserCog className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('team.empty')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">{t('team.emptyDescription')}</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            {t('team.addMember')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(member => {
            const isSelf = member.userId === user?.id;
            const statusOptions = isSelf ? STATUS_ORDER.filter(s => s !== 'SUSPENDED') : STATUS_ORDER;
            return (
              <div
                key={member.userId}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold">
                      {(member.name || member.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {member.name || member.email}
                      {isSelf && (
                        <span className="ms-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                          ({t('team.you')})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:shrink-0">
                  {isOwner ? (
                    <>
                      <select
                        aria-label={t('team.changeRole', { name: member.name || member.email })}
                        value={member.role}
                        disabled={savingUserId === member.userId}
                        onChange={e => onRoleChange(member, e.target.value as MemberRole)}
                        className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${ROLE_STYLES[member.role]}`}
                      >
                        {ROLE_ORDER.map(role => (
                          <option key={role} value={role} className="bg-white text-slate-900">
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={t('team.changeStatus', { name: member.name || member.email })}
                        value={member.status}
                        disabled={savingUserId === member.userId}
                        onChange={e => onStatusChange(member, e.target.value as MemberStatus)}
                        className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${STATUS_STYLES[member.status]}`}
                      >
                        {statusOptions.map(status => (
                          <option key={status} value={status} className="bg-white text-slate-900">
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <span className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${ROLE_STYLES[member.role]}`}>
                        {roleLabel(member.role)}
                      </span>
                      <span className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${STATUS_STYLES[member.status]}`}>
                        {statusLabel(member.status)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-add-title"
            className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-8 animate-scale-in border border-slate-100 dark:border-slate-700"
          >
            <h3 id="team-add-title" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
              {t('team.addTitle')}
            </h3>

            <form onSubmit={submitAdd} className="space-y-5">
              <div>
                <label htmlFor="team-add-email" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {t('team.email')}
                </label>
                <input
                  id="team-add-email"
                  type="email"
                  required
                  value={addForm.email}
                  onChange={e => setAddForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label htmlFor="team-add-name" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {t('team.name')}
                </label>
                <input
                  id="team-add-name"
                  type="text"
                  value={addForm.name}
                  onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label htmlFor="team-add-password" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {t('team.password')}
                </label>
                <input
                  id="team-add-password"
                  type="password"
                  autoComplete="new-password"
                  value={addForm.password}
                  onChange={e => setAddForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('team.passwordHint')}</p>
              </div>

              <div>
                <label htmlFor="team-add-role" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {t('team.role')}
                </label>
                <select
                  id="team-add-role"
                  value={addForm.role}
                  onChange={e => setAddForm(prev => ({ ...prev, role: e.target.value as MemberRole }))}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all cursor-pointer"
                >
                  {assignableRoles.map(role => (
                    <option key={role} value={role}>{roleLabel(role)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetAddForm();
                  }}
                  className="flex-1 py-3.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={addSaving}
                  className="flex-1 py-3.5 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-emerald-50 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {t('team.addSubmit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingSuspend && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-suspend-title"
            className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scale-in text-center"
          >
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 id="team-suspend-title" className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {t('team.changeStatus', { name: pendingSuspend.name || pendingSuspend.email })}?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              {t('team.statusSuspended')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingSuspend(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmSuspend}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-500/30 transition-all"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;

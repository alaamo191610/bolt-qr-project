import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, TrendingUp, DollarSign, Crown, LogOut, Search, ArrowUp, ArrowDown, Settings, Plus, Copy, RefreshCw, X } from 'lucide-react';
import { superAdminService, type Restaurant, type SubscriptionPlan } from '../../services/superAdminService';
import { isUnauthenticatedError } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import PlanManagementModal from './PlanManagementModal';
import RestaurantProvisioningModal from './RestaurantProvisioningModal';
import toast from 'react-hot-toast';

const SuperAdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalRestaurants: 0, activeRestaurants: 0, totalRevenue: 0, growth: 0 });
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPlan, setSelectedPlan] = useState<'ALL' | 'STANDARD' | 'BASIC' | 'PRO'>('ALL');
    const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProvisioningOpen, setIsProvisioningOpen] = useState(false);
    const [replacementInvitation, setReplacementInvitation] = useState<{ name: string; url: string } | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const restaurantRequestRevision = useRef(0);

    const loadData = useCallback(async (requestRevision: number) => {
        try {
            const [statsData, restaurantsData] = await Promise.all([
                superAdminService.getStats(),
                superAdminService.getRestaurantsPage({
                    limit: 25,
                    search: searchTerm.trim() || undefined,
                    plan: selectedPlan,
                }),
            ]);
            if (requestRevision !== restaurantRequestRevision.current) return;
            setStats(statsData);
            setRestaurants(restaurantsData.items);
            setNextCursor(restaurantsData.pagination.nextCursor);
            setHasMore(restaurantsData.pagination.hasMore);
        } catch (error) {
            if (requestRevision !== restaurantRequestRevision.current) return;
            console.error('Error loading data:', error);
            if (isUnauthenticatedError(error)) {
                toast.error('Your session expired. Please sign in again.');
                navigate('/super-admin/login');
            } else {
                toast.error('Could not load dashboard data. Please try again.');
            }
        } finally {
            if (requestRevision === restaurantRequestRevision.current) setLoading(false);
        }
    }, [navigate, searchTerm, selectedPlan]);

    useEffect(() => {
        const requestRevision = ++restaurantRequestRevision.current;
        const timeout = window.setTimeout(() => void loadData(requestRevision), 250);
        return () => window.clearTimeout(timeout);
    }, [loadData]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        const requestRevision = restaurantRequestRevision.current;
        setLoadingMore(true);
        try {
            const page = await superAdminService.getRestaurantsPage({
                cursor: nextCursor,
                limit: 25,
                search: searchTerm.trim() || undefined,
                plan: selectedPlan,
            });
            if (requestRevision !== restaurantRequestRevision.current) return;
            setRestaurants(current => [...current, ...page.items]);
            setNextCursor(page.pagination.nextCursor);
            setHasMore(page.pagination.hasMore);
        } catch (error) {
            if (requestRevision !== restaurantRequestRevision.current) return;
            toast.error(getErrorMessage(error, 'Could not load more restaurants'));
        } finally {
            if (requestRevision === restaurantRequestRevision.current) setLoadingMore(false);
        }
    };

    const handleLogout = async () => {
        await superAdminService.logout().catch(() => undefined);
        navigate('/super-admin/login');
    };

    const handleUpgradePlan = async (
        restaurantId: string,
        newPlan: string,
        status?: string,
        subscriptionEnd?: string,
        trialEndsAt?: string,
    ) => {
        try {
            await superAdminService.updateRestaurantPlan(restaurantId, newPlan, status, subscriptionEnd, trialEndsAt);
            const requestRevision = ++restaurantRequestRevision.current;
            void loadData(requestRevision);
        } catch (error) {
            if (isUnauthenticatedError(error)) {
                toast.error('For security, please sign in with MFA again.');
                navigate('/super-admin/login');
                return;
            }
            toast.error(getErrorMessage(error, 'Failed to update plan'));
        }
    };

    const filteredRestaurants = restaurants;

    const handleRotateInvitation = async (restaurant: Restaurant) => {
        try {
            const invitation = await superAdminService.rotateRestaurantInvitation(restaurant.id);
            setReplacementInvitation({
                name: restaurant.restaurant_name || restaurant.email,
                url: `${window.location.origin}${invitation.activationPath}`,
            });
        } catch (error) {
            if (isUnauthenticatedError(error)) {
                toast.error('For security, please sign in with MFA again.');
                navigate('/super-admin/login');
                return;
            }
            toast.error(getErrorMessage(error, 'Failed to replace invitation'));
        }
    };

    const getPlanColor = (plan: string) => {
        switch (plan) {
            case 'PRO': return 'bg-gradient-to-r from-purple-600 to-pink-600';
            case 'BASIC': return 'bg-gradient-to-r from-blue-600 to-cyan-600';
            case 'STANDARD': return 'bg-gradient-to-r from-emerald-600 to-green-600';
            default: return 'bg-slate-600';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-900">
            {/* Header */}
            <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg sm:h-10 sm:w-10">
                                <Crown className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-bold text-slate-900 dark:text-white sm:text-2xl">Super Admin</h1>
                                <p className="truncate text-xs text-slate-600 dark:text-slate-400 sm:text-sm">Platform Management</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleLogout}
                            aria-label="Logout"
                            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 sm:px-4"
                        >
                            <LogOut className="h-5 w-5" />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                {/* Stats Grid */}
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mb-8 lg:grid-cols-4 lg:gap-6">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stats.totalRestaurants}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Total Restaurants</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stats.activeRestaurants}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Active Subscriptions</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                                <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">${stats.totalRevenue}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Monthly Revenue (MRR)</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 flex items-center">
                            {stats.growth > 0 && <ArrowUp className="w-5 h-5 text-emerald-600 mr-1" />}
                            {stats.growth < 0 && <ArrowDown className="w-5 h-5 text-red-600 mr-1" />}
                            +{stats.growth}%
                        </h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Growth (30 days)</p>
                    </div>
                </div>

                {/* Restaurants List */}
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="border-b border-slate-200 p-4 dark:border-slate-700 sm:p-6">
                        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white sm:text-xl">Restaurants</h2>
                                <button
                                    type="button"
                                    onClick={() => setIsProvisioningOpen(true)}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
                                >
                                    <Plus className="h-4 w-4" /> Add restaurant
                                </button>
                            </div>
                            <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:overflow-visible sm:pb-0">
                                {(['ALL', 'STANDARD', 'BASIC', 'PRO'] as const).map(plan => (
                                    <button
                                        key={plan}
                                        onClick={() => setSelectedPlan(plan as 'ALL' | SubscriptionPlan)}
                                        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${selectedPlan === plan
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        {plan}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search restaurants..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>

                    <div className="p-4 sm:p-6">
                        {filteredRestaurants.length === 0 ? (
                            <div className="text-center py-12">
                                <Building2 className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                                <p className="text-slate-600 dark:text-slate-400">
                                    {searchTerm || selectedPlan !== 'ALL' ? 'No matching restaurants' : 'No restaurants yet'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredRestaurants.map((restaurant) => (
                                    <div
                                        key={restaurant.id}
                                        className="rounded-lg border border-slate-200 p-3 transition-shadow hover:shadow-md dark:border-slate-700 sm:p-4"
                                    >
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                                    <h3 className="min-w-0 break-words text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
                                                        {restaurant.restaurant_name || 'Unnamed Restaurant'}
                                                    </h3>
                                                    <span
                                                        className={`${getPlanColor(restaurant.subscription_plan)} shrink-0 rounded px-2 py-1 text-xs font-semibold text-white`}
                                                    >
                                                        {restaurant.subscription_plan}
                                                    </span>
                                                    <span className={`shrink-0 rounded px-2 py-1 text-xs ${restaurant.subscription_status === 'ACTIVE'
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                        {restaurant.subscription_status}
                                                    </span>
                                                    {restaurant.activation_status === 'INVITED' && (
                                                        <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Awaiting activation</span>
                                                    )}
                                                </div>
                                                <p className="mb-3 break-all text-sm text-slate-600 dark:text-slate-400">{restaurant.email}</p>

                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                                                    <span>{restaurant._count.menus} menu items</span>
                                                    <span>{restaurant._count.tables} tables</span>
                                                    <span>{restaurant._count.orders} orders</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                                                {restaurant.activation_status === 'INVITED' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleRotateInvitation(restaurant)}
                                                        className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 sm:w-auto"
                                                    >
                                                        <RefreshCw className="h-4 w-4" /> New activation link
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setSelectedRestaurant(restaurant);
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm text-white transition-all hover:shadow-lg sm:w-auto"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                    <span>Manage Plan</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {hasMore && (
                                    <button
                                        type="button"
                                        onClick={() => void loadMore()}
                                        disabled={loadingMore}
                                        className="w-full rounded-lg border border-purple-200 px-4 py-3 font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                                    >
                                        {loadingMore ? 'Loading…' : 'Load more restaurants'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Plan Management Modal */}
            <PlanManagementModal
                restaurant={selectedRestaurant}
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedRestaurant(null);
                }}
                onUpdate={async (restaurantId, plan, status, subscriptionEnd, trialEndsAt) => {
                    await handleUpgradePlan(restaurantId, plan, status, subscriptionEnd, trialEndsAt);
                }}
            />
            <RestaurantProvisioningModal
                isOpen={isProvisioningOpen}
                onClose={() => setIsProvisioningOpen(false)}
                onCreated={async () => {
                    const requestRevision = ++restaurantRequestRevision.current;
                    await loadData(requestRevision);
                }}
            />
            {replacementInvitation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="replacement-invitation-title">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800 sm:p-6">
                        <div className="mb-5 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 id="replacement-invitation-title" className="text-lg font-bold text-slate-900 dark:text-white sm:text-xl">Replacement activation link</h2>
                                <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{replacementInvitation.name}. All previous unused links are revoked.</p>
                            </div>
                            <button type="button" aria-label="Close" onClick={() => setReplacementInvitation(null)} className="shrink-0"><X /></button>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input readOnly aria-label="Replacement activation link" value={replacementInvitation.url} className="min-w-0 w-full flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(replacementInvitation.url).then(() => toast.success('Activation link copied'))}
                                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white sm:w-auto"
                            ><Copy className="h-4 w-4" /> Copy</button>
                        </div>
                        <p className="mt-3 text-xs text-amber-700">This secret is shown only now. Share it through a trusted channel.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminDashboard;

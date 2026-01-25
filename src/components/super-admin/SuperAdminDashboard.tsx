import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, TrendingUp, DollarSign, Crown, LogOut, Search, ArrowUp, ArrowDown, Settings } from 'lucide-react';
import { superAdminService } from '../../services/superAdminService';
import PlanManagementModal from './PlanManagementModal';
import toast from 'react-hot-toast';

const SuperAdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalRestaurants: 0, activeRestaurants: 0, totalRevenue: 0, growth: 0 });
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPlan, setSelectedPlan] = useState<'ALL' | 'STANDARD' | 'BASIC' | 'PRO'>('ALL');
    const [selectedRestaurant, setSelectedRestaurant] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const token = localStorage.getItem('superAdminToken');
        if (!token) {
            navigate('/super-admin/login');
            return;
        }

        try {
            const [statsData, restaurantsData] = await Promise.all([
                superAdminService.getStats(token),
                superAdminService.getRestaurants(token),
            ]);
            setStats(statsData);
            setRestaurants(restaurantsData);
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('superAdminToken');
        navigate('/super-admin/login');
    };

    const handleUpgradePlan = async (restaurantId: string, newPlan: string, status?: string, endDate?: string) => {
        const token = localStorage.getItem('superAdminToken');
        if (!token) return;

        try {
            await superAdminService.updateRestaurantPlan(token, restaurantId, newPlan, status, endDate);
            toast.success('Plan updated successfully');
            loadData(); // Reload data
        } catch (error) {
            toast.error('Failed to update plan');
        }
    };

    const filteredRestaurants = restaurants.filter(r => {
        const matchesSearch = !searchTerm ||
            r.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.restaurant_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPlan = selectedPlan === 'ALL' || r.subscription_plan === selectedPlan;
        return matchesSearch && matchesPlan;
    });

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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* Header */}
            <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                                <Crown className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Super Admin</h1>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Platform Management</p>
                            </div>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center space-x-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stats.totalRestaurants}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Total Restaurants</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stats.activeRestaurants}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Active Subscriptions</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                                <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">${stats.totalRevenue}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Monthly Revenue (MRR)</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
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
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Restaurants</h2>
                            <div className="flex items-center space-x-2">
                                {['ALL', 'STANDARD', 'BASIC', 'PRO'].map(plan => (
                                    <button
                                        key={plan}
                                        onClick={() => setSelectedPlan(plan as any)}
                                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${selectedPlan === plan
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
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>

                    <div className="p-6">
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
                                        className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-3 mb-2">
                                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                                        {restaurant.restaurant_name || 'Unnamed Restaurant'}
                                                    </h3>
                                                    <span
                                                        className={`${getPlanColor(restaurant.subscription_plan)} text-white text-xs px-2 py-1 rounded font-semibold`}
                                                    >
                                                        {restaurant.subscription_plan}
                                                    </span>
                                                    <span className={`text-xs px-2 py-1 rounded ${restaurant.subscription_status === 'ACTIVE'
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                        {restaurant.subscription_status}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{restaurant.email}</p>

                                                <div className="flex items-center space-x-6 text-sm text-slate-600 dark:text-slate-400">
                                                    <span>{restaurant._count.menus} menu items</span>
                                                    <span>{restaurant._count.tables} tables</span>
                                                    <span>{restaurant._count.orders} orders</span>
                                                </div>
                                            </div>

                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => {
                                                        setSelectedRestaurant(restaurant);
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                    <span>Manage Plan</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
                onUpdate={async (restaurantId, plan, status, endDate) => {
                    await handleUpgradePlan(restaurantId, plan, status, endDate);
                }}
            />
        </div>
    );
};

export default SuperAdminDashboard;

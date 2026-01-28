import React, { useState } from 'react';
import { X, Check, Crown, Zap, Rocket } from 'lucide-react';
import toast from 'react-hot-toast';

interface Restaurant {
    id: string;
    email: string;
    restaurant_name?: string;
    subscription_plan: string;
    subscription_status: string;
    subscription_end?: Date;
}

interface PlanManagementModalProps {
    restaurant: Restaurant | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (restaurantId: string, plan: string, status: string, endDate?: string) => Promise<void>;
}

const PlanManagementModal: React.FC<PlanManagementModalProps> = ({
    restaurant,
    isOpen,
    onClose,
    onUpdate,
}) => {
    const [selectedPlan, setSelectedPlan] = useState(restaurant?.subscription_plan || 'STANDARD');
    const [selectedStatus, setSelectedStatus] = useState(restaurant?.subscription_status || 'ACTIVE');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen || !restaurant) return null;

    const plans = [
        {
            value: 'STANDARD',
            name: 'Standard',
            price: 10,
            icon: Rocket,
            color: 'from-emerald-600 to-green-600',
            features: ['10 tables', '50 menu items', 'Basic analytics', '1 staff account'],
        },
        {
            value: 'BASIC',
            name: 'Basic',
            price: 29,
            icon: Zap,
            color: 'from-blue-600 to-cyan-600',
            features: ['25 tables', '150 menu items', 'Advanced analytics', '3 staff accounts', 'Custom QR styling'],
        },
        {
            value: 'PRO',
            name: 'Pro',
            price: 79,
            icon: Crown,
            color: 'from-purple-600 to-pink-600',
            features: ['Unlimited tables', 'Unlimited items', 'All features', 'KDS', 'API access', '10 staff accounts'],
        },
    ];

    const statuses = [
        { value: 'ACTIVE', label: 'Active', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
        { value: 'PAST_DUE', label: 'Past Due', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
        { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
        { value: 'TRIAL', label: 'Trial', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    ];

    const handleSave = async () => {
        setLoading(true);
        try {
            await onUpdate(restaurant.id, selectedPlan, selectedStatus, endDate || undefined);
            toast.success('Subscription updated successfully!');
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Failed to update subscription');
        } finally {
            setLoading(false);
        }
    };

    // Calculate default end date (30 days from now)
    const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 30);
    const defaultEndDateStr = defaultEndDate.toISOString().split('T')[0];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Subscription</h2>
                        <p className="text-slate-600 dark:text-slate-400 mt-1">
                            {restaurant.restaurant_name || 'Unnamed Restaurant'} ({restaurant.email})
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Plan Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-3">
                            Select Plan
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {plans.map((plan) => {
                                const Icon = plan.icon;
                                const isSelected = selectedPlan === plan.value;

                                return (
                                    <button
                                        key={plan.value}
                                        onClick={() => setSelectedPlan(plan.value)}
                                        className={`relative p-4 rounded-xl border-2 transition-all text-left ${isSelected
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                            }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                                                <Check className="w-4 h-4 text-white" />
                                            </div>
                                        )}

                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-3`}>
                                            <Icon className="w-6 h-6 text-white" />
                                        </div>

                                        <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{plan.name}</h3>
                                        <p className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                                            ${plan.price}<span className="text-sm text-slate-600 dark:text-slate-400">/mo</span>
                                        </p>

                                        <ul className="space-y-1">
                                            {plan.features.map((feature, idx) => (
                                                <li key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex items-center">
                                                    <Check className="w-3 h-3 text-emerald-600 mr-1 flex-shrink-0" />
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-3">
                            Subscription Status
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {statuses.map((status) => {
                                const isSelected = selectedStatus === status.value;

                                return (
                                    <button
                                        key={status.value}
                                        onClick={() => setSelectedStatus(status.value)}
                                        className={`px-4 py-3 rounded-lg font-medium text-sm transition-all ${isSelected
                                            ? status.color + ' ring-2 ring-offset-2 ring-purple-500'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        {status.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-3">
                            Subscription End Date (Optional)
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            placeholder={defaultEndDateStr}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            Leave empty for no expiration. Default is 30 days from now.
                        </p>
                    </div>

                    {/* Summary */}
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Summary</h3>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Plan:</span>
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {plans.find(p => p.value === selectedPlan)?.name} (${plans.find(p => p.value === selectedPlan)?.price}/mo)
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Status:</span>
                                <span className="font-medium text-slate-900 dark:text-white">{selectedStatus}</span>
                            </div>
                            {endDate && (
                                <div className="flex justify-between">
                                    <span className="text-slate-600 dark:text-slate-400">Expires:</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{endDate}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-6 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-6 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlanManagementModal;

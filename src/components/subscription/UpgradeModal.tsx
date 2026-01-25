import React from 'react';
import { X, Check, Crown, Zap, Rocket } from 'lucide-react';
import { PLAN_CONFIG, SubscriptionPlan } from '../../types/subscription';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPlan: SubscriptionPlan;
    featureMessage?: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
    isOpen,
    onClose,
    currentPlan,
    featureMessage = 'This feature requires an upgrade'
}) => {
    if (!isOpen) return null;

    const plans: SubscriptionPlan[] = ['STANDARD', 'BASIC', 'PRO'];

    const getPlanIcon = (plan: SubscriptionPlan) => {
        switch (plan) {
            case 'PRO': return <Crown className="w-8 h-8" />;
            case 'BASIC': return <Zap className="w-8 h-8" />;
            case 'STANDARD': return <Rocket className="w-8 h-8" />;
        }
    };

    const getPlanColor = (plan: SubscriptionPlan) => {
        switch (plan) {
            case 'PRO': return 'from-purple-600 to-pink-600';
            case 'BASIC': return 'from-blue-600 to-cyan-600';
            case 'STANDARD': return 'from-emerald-600 to-green-600';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Upgrade Your Plan</h2>
                        <p className="text-slate-600 dark:text-slate-400 mt-1">{featureMessage}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Plans Grid */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => {
                        const config = PLAN_CONFIG[plan];
                        const isCurrent = plan === currentPlan;
                        const isUpgrade = plans.indexOf(plan) > plans.indexOf(currentPlan);

                        return (
                            <div
                                key={plan}
                                className={`relative rounded-2xl border-2 p-6 transition-all ${isCurrent
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                    : isUpgrade
                                        ? 'border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:shadow-xl'
                                        : 'border-slate-200 dark:border-slate-700 opacity-60'
                                    }`}
                            >
                                {/* Current Plan Badge */}
                                {isCurrent && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                                            CURRENT PLAN
                                        </span>
                                    </div>
                                )}

                                {/* Plan Header */}
                                <div className="text-center mb-6">
                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${getPlanColor(plan)} flex items-center justify-center text-white shadow-lg`}>
                                        {getPlanIcon(plan)}
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{config.name}</h3>
                                    <div className="mt-2">
                                        <span className="text-4xl font-bold text-slate-900 dark:text-white">${config.price}</span>
                                        <span className="text-slate-600 dark:text-slate-400">/month</span>
                                    </div>
                                </div>

                                {/* Features List */}
                                <ul className="space-y-3 mb-6">
                                    <li className="flex items-start space-x-2">
                                        <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">
                                            {config.maxTables === Infinity ? 'Unlimited' : config.maxTables} tables
                                        </span>
                                    </li>
                                    <li className="flex items-start space-x-2">
                                        <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">
                                            {config.maxMenuItems === Infinity ? 'Unlimited' : config.maxMenuItems} menu items
                                        </span>
                                    </li>
                                    <li className="flex items-start space-x-2">
                                        <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">
                                            {config.maxStaffAccounts} staff {config.maxStaffAccounts === 1 ? 'account' : 'accounts'}
                                        </span>
                                    </li>
                                    {config.hasAnalytics && (
                                        <li className="flex items-start space-x-2">
                                            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">
                                                {config.hasAdvancedAnalytics ? 'Advanced' : 'Basic'} analytics
                                            </span>
                                        </li>
                                    )}
                                    {config.hasKDS && (
                                        <li className="flex items-start space-x-2">
                                            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">Kitchen Display System</span>
                                        </li>
                                    )}
                                    {config.hasCustomQRStyling && (
                                        <li className="flex items-start space-x-2">
                                            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">Custom QR styling</span>
                                        </li>
                                    )}
                                    {config.hasCustomBranding && (
                                        <li className="flex items-start space-x-2">
                                            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">Custom branding</span>
                                        </li>
                                    )}
                                    {config.hasAPIAccess && (
                                        <li className="flex items-start space-x-2">
                                            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">API access</span>
                                        </li>
                                    )}
                                    {config.hasMultiLocation && (
                                        <li className="flex items-start space-x-2">
                                            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">Multi-location support</span>
                                        </li>
                                    )}
                                </ul>

                                {/* Action Button */}
                                <button
                                    disabled={!isUpgrade}
                                    className={`w-full py-3 rounded-xl font-semibold transition-all ${isCurrent
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                                        : isUpgrade
                                            ? `bg-gradient-to-r ${getPlanColor(plan)} text-white hover:shadow-lg hover:scale-105`
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    {isCurrent ? 'Current Plan' : isUpgrade ? `Upgrade to ${config.name}` : 'Downgrade'}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-900/50">
                    <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                        All plans include 24/7 email support and regular updates. Cancel anytime.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;

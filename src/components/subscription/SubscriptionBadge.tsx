import React from 'react';
import { Crown, Zap, Rocket, AlertCircle } from 'lucide-react';
import { useSubscription } from '../../hooks/useSubscription';
import { AdminWithSubscription } from '../../types/subscription';

interface SubscriptionBadgeProps {
    adminProfile: AdminWithSubscription;
    showDetails?: boolean;
}

const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({ adminProfile, showDetails = false }) => {
    const subscription = useSubscription(adminProfile);

    const getBadgeStyles = () => {
        if (subscription.isPro) {
            return {
                bg: 'bg-gradient-to-r from-purple-600 to-pink-600',
                icon: <Crown className="w-4 h-4" />,
                label: 'PRO',
            };
        }
        if (subscription.isBasic) {
            return {
                bg: 'bg-gradient-to-r from-blue-600 to-cyan-600',
                icon: <Zap className="w-4 h-4" />,
                label: 'BASIC',
            };
        }
        return {
            bg: 'bg-gradient-to-r from-emerald-600 to-green-600',
            icon: <Rocket className="w-4 h-4" />,
            label: 'STANDARD',
        };
    };

    const { bg, icon, label } = getBadgeStyles();

    return (
        <div className="inline-flex flex-col">
            <div className={`${bg} text-white px-3 py-1.5 rounded-lg shadow-md flex items-center space-x-2`}>
                {icon}
                <span className="text-sm font-bold">{label}</span>
            </div>

            {showDetails && (
                <div className="mt-2 space-y-1">
                    {/* Expiration warning */}
                    {subscription.daysUntilExpiration !== null && subscription.daysUntilExpiration <= 7 && (
                        <div className="flex items-center space-x-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertCircle className="w-3 h-3" />
                            <span>Expires in {subscription.daysUntilExpiration} days</span>
                        </div>
                    )}

                    {/* Trial badge */}
                    {subscription.isTrial && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">
                            Trial Active
                        </span>
                    )}

                    {/* Past due warning */}
                    {subscription.isPastDue && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                            Payment Due
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default SubscriptionBadge;

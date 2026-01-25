import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';
import { adminService } from '../services/adminService';
import toast from 'react-hot-toast';
import LogoUpload from './ui/LogoUpload';

interface OnboardingWizardProps {
    onComplete: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form state
    const [restaurantName, setRestaurantName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [logo, setLogo] = useState<string | null>(null); // Base64 string

    const totalSteps = 2; // Reduced to 2 steps: Info + Logo

    const handleComplete = async () => {
        if (!restaurantName.trim()) {
            toast.error('Please enter your restaurant name');
            return;
        }

        try {
            setLoading(true);
            await adminService.updateAdminProfile(user?.id, {
                restaurant_name: restaurantName,
                phone,
                address,
                logo_url: logo || undefined, // Save base64 logo
            });
            toast.success('Setup complete!');
            onComplete();
        } catch (error) {
            toast.error('Failed to save settings');
            console.error('Onboarding error:', error);
        } finally {
            setLoading(false);
        }
    };

    const canProgress = () => {
        if (currentStep === 1) return restaurantName.trim().length > 0;
        if (currentStep === 2) return true; // Logo is optional
        return true;
    };

    const handleNext = () => {
        if (currentStep < totalSteps) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-800 dark:to-emerald-950 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden">
                {/* Progress bar */}
                <div className="bg-slate-100 dark:bg-slate-700 h-2">
                    <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-green-600 transition-all duration-300"
                        style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                    />
                </div>

                {/* Content */}
                <div className="p-8 sm:p-12">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-2xl font-bold text-white">{currentStep}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Step {currentStep} of {totalSteps}
                        </p>
                    </div>

                    {/* Step 1: Restaurant Details */}
                    {currentStep === 1 && (
                        <div className="space-y-6 animate-scale-in">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                                    Welcome to Your Restaurant!
                                </h2>
                                <p className="text-slate-600 dark:text-slate-400">
                                    Let's start by setting up your restaurant details
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Restaurant Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={restaurantName}
                                        onChange={(e) => setRestaurantName(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., Green Leaf Restaurant"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Phone Number (Optional)
                                    </label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., +974 1234 5678"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Address (Optional)
                                    </label>
                                    <textarea
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., 123 Main Street, Doha"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Logo Upload */}
                    {currentStep === 2 && (
                        <div className="space-y-6 animate-scale-in">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                                    Add Your Logo
                                </h2>
                                <p className="text-slate-600 dark:text-slate-400">
                                    Upload a logo to personalize your restaurant (you can skip this for now)
                                </p>
                            </div>

                            <div className="max-w-md mx-auto">
                                <LogoUpload
                                    currentLogo={logo}
                                    onLogoChange={setLogo}
                                    restaurantName={restaurantName}
                                />
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 1}
                            className="px-6 py-3 rounded-lg border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                        >
                            <ChevronLeft className="w-5 h-5" />
                            Back
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={!canProgress() || loading}
                            className="px-8 py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white font-semibold hover:from-emerald-700 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                    Saving...
                                </>
                            ) : currentStep === totalSteps ? (
                                <>
                                    Complete
                                    <Check className="w-5 h-5" />
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes scale-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-scale-in {
                    animation: scale-in 0.3s ease-out;
                }
            `}</style>
        </div>
    );
};

export default OnboardingWizard;

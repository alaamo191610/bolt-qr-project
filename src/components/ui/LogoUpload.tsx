import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface LogoUploadProps {
    currentLogo?: string | null;
    onLogoChange: (base64: string | null) => void;
    restaurantName?: string;
}

const LogoUpload: React.FC<LogoUploadProps> = ({
    currentLogo,
    onLogoChange,
    restaurantName
}) => {
    const [preview, setPreview] = useState<string | null>(currentLogo || null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

    const handleFileChange = async (file: File | null) => {
        if (!file) return;

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            toast.error('Please upload a valid image (JPG, PNG, WebP, or SVG)');
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            toast.error('Image must be less than 2MB');
            return;
        }

        // Read and convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setPreview(base64);
            onLogoChange(base64);
            toast.success('Logo uploaded successfully!');
        };
        reader.onerror = () => {
            toast.error('Failed to read image file');
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileChange(file);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleRemove = () => {
        setPreview(null);
        onLogoChange(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        toast.success('Logo removed');
    };

    return (
        <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Restaurant Logo
            </label>

            {/* Preview or Upload Area */}
            {preview ? (
                <div className="relative">
                    {/* Logo Preview */}
                    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700">
                        <img
                            src={preview}
                            alt="Restaurant Logo"
                            className="h-20 w-20 object-cover rounded-lg shadow-md"
                        />
                        <div className="flex-1">
                            <p className="font-medium text-slate-900 dark:text-white">
                                {restaurantName || 'Your Restaurant'}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Logo preview
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition text-red-600 dark:text-red-400"
                            title="Remove logo"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Change Logo Button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 w-full px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg hover:border-emerald-500 dark:hover:border-emerald-500 transition text-sm text-slate-700 dark:text-slate-300"
                    >
                        Change Logo
                    </button>
                </div>
            ) : (
                /* Upload Area */
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800'
                        }`}
                >
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                            {isDragging ? (
                                <Upload className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                                <ImageIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                            )}
                        </div>

                        <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                Click to upload or drag and drop
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                PNG, JPG, WebP, or SVG (max 2MB)
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                            <span>Recommended: 400x400px</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
            />

            <p className="text-xs text-slate-500 dark:text-slate-400">
                Your logo will appear in the customer menu and admin panel
            </p>
        </div>
    );
};

export default LogoUpload;

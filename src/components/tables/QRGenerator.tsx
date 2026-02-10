import React, { useState, useEffect, useRef } from 'react';
import QRCodeStyling, {
  DrawType,
  TypeNumber,
  Mode,
  ErrorCorrectionLevel,
  DotType,
  CornerSquareType,
  CornerDotType
} from 'qr-code-styling';
import {
  QrCode,
  Download,
  Eye,
  Copy,
  Check,
  Printer,
  Palette,
  Maximize2,
  X,
  Settings,
  Share2
} from 'lucide-react';

interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
}

interface QRGeneratorProps {
  tables: Table[];
}

const COLORS = [
  { name: 'Emerald', value: '#059669', class: 'bg-emerald-600', gradient: ['#10b981', '#047857'] },
  { name: 'Blue', value: '#2563eb', class: 'bg-blue-600', gradient: ['#3b82f6', '#1d4ed8'] },
  { name: 'Indigo', value: '#4f46e5', class: 'bg-indigo-600', gradient: ['#6366f1', '#4338ca'] },
  { name: 'Violet', value: '#7c3aed', class: 'bg-violet-600', gradient: ['#8b5cf6', '#6d28d9'] },
  { name: 'Rose', value: '#e11d48', class: 'bg-rose-600', gradient: ['#f43f5e', '#be123c'] },
  { name: 'Amber', value: '#d97706', class: 'bg-amber-600', gradient: ['#f59e0b', '#b45309'] },
  { name: 'Slate', value: '#475569', class: 'bg-slate-600', gradient: ['#64748b', '#334155'] },
  { name: 'Black', value: '#000000', class: 'bg-black', gradient: ['#333333', '#000000'] },
];

const DOT_STYLES: { label: string; value: DotType }[] = [
  { label: 'Square', value: 'square' },
  { label: 'Rounded', value: 'rounded' },
  { label: 'Dominos', value: 'dots' },
  { label: 'Classy', value: 'classy' },
  { label: 'Classy Rounded', value: 'classy-rounded' },
  { label: 'Extra Rounded', value: 'extra-rounded' },
];

const CORNER_STYLES: { label: string; value: CornerSquareType }[] = [
  { label: 'Square', value: 'square' },
  { label: 'Dot', value: 'dot' },
  { label: 'Extra Rounded', value: 'extra-rounded' },
];

// Helper component for rendering a single QR
const SingleQRCode = ({
  tableNumber,
  size,
  color,
  dotStyle,
  cornerStyle,
  logo
}: {
  tableNumber: string;
  size: number;
  color: { value: string; gradient: string[] };
  dotStyle: DotType;
  cornerStyle: CornerSquareType;
  logo?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const baseURL = window.location.origin;
    const menuURL = `${baseURL}/menu?table=${tableNumber}`;

    const qrOptions = {
      width: size,
      height: size,
      type: 'svg' as DrawType,
      data: menuURL,
      image: logo || undefined,
      margin: 10,
      qrOptions: {
        typeNumber: 0 as TypeNumber,
        mode: 'Byte' as Mode,
        errorCorrectionLevel: 'Q' as ErrorCorrectionLevel
      },
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.4,
        margin: 5,
        crossOrigin: 'anonymous',
      },
      dotsOptions: {
        color: color.value,
        type: dotStyle,
        gradient: {
          type: 'linear',
          rotation: 45,
          colorStops: [
            { offset: 0, color: color.gradient[0] },
            { offset: 1, color: color.gradient[1] }
          ]
        }
      },
      cornersSquareOptions: {
        color: color.value,
        type: cornerStyle,
      },
      cornersDotOptions: {
        color: color.value,
        type: cornerStyle === 'square' ? 'square' : 'dot' as CornerDotType // Match corner dot to square roughly
      },
      backgroundOptions: {
        color: '#ffffff',
      },
    };

    if (!qrCodeRef.current) {
      qrCodeRef.current = new QRCodeStyling(qrOptions);
      if (ref.current) {
        qrCodeRef.current.append(ref.current);
      }
    } else {
      qrCodeRef.current.update(qrOptions);
    }
  }, [tableNumber, size, color, dotStyle, cornerStyle, logo]);

  return <div ref={ref} className="qr-container" />;
};


const QRGenerator: React.FC<QRGeneratorProps> = ({ tables }) => {
  const [qrSize, setQrSize] = useState(250);
  const [accentColor, setAccentColor] = useState(COLORS[0]);
  const [dotStyle, setDotStyle] = useState<DotType>('rounded');
  const [cornerStyle, setCornerStyle] = useState<CornerSquareType>('extra-rounded');
  const [copiedTable, setCopiedTable] = useState<string>('');
  const [showPreview, setShowPreview] = useState<Table | null>(null);

  // For the actual download method, we instantiate a temporary QR logic
  const downloadQRCode = async (tableNumber: string, format: 'png' | 'svg' = 'png') => {
    const baseURL = window.location.origin;
    const menuURL = `${baseURL}/menu?table=${tableNumber}`;

    const qr = new QRCodeStyling({
      width: 1000, // High res
      height: 1000,
      type: format === 'png' ? 'canvas' : 'svg',
      data: menuURL,
      image: undefined, // Add logo here if needed in future
      dotsOptions: {
        color: accentColor.value,
        type: dotStyle,
        gradient: {
          type: 'linear',
          rotation: 45,
          colorStops: [
            { offset: 0, color: accentColor.gradient[0] },
            { offset: 1, color: accentColor.gradient[1] }
          ]
        }
      },
      cornersSquareOptions: {
        type: cornerStyle,
        color: accentColor.value
      },
      cornersDotOptions: {
        type: cornerStyle === 'square' ? 'square' : 'dot',
        color: accentColor.value
      },
      backgroundOptions: { color: "#ffffff" }
    });

    await qr.download({ name: `Table-${tableNumber}-Menu-QR`, extension: format });
  };

  const copyToClipboard = async (tableNumber: string) => {
    const baseURL = window.location.origin;
    const menuURL = `${baseURL}/menu?table=${tableNumber}`;

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(menuURL);
      } else {
        // Fallback for browsers that don't support clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = menuURL;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(textArea);
        }
      }

      setCopiedTable(tableNumber);
      setTimeout(() => setCopiedTable(''), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      // Still show success message as the fallback might have worked
      setCopiedTable(tableNumber);
      setTimeout(() => setCopiedTable(''), 2000);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in p-2">

      {/* --- Controls Header --- */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 sticky top-4 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 supports-[backdrop-filter]:bg-white/60">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">

          <div className="flex items-center gap-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 transition-transform hover:rotate-6 ${accentColor.class}`}>
              <QrCode className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">QR Studio</h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Design & Print Table Cards</p>
            </div>
          </div>

          <div className="w-full xl:w-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Color Picker */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Palette className="w-3 h-3" />
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => setAccentColor(color)}
                    className={`w-6 h-6 rounded-full transition-all duration-300 relative group ${color.class} ${accentColor.name === color.name ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110' : 'hover:scale-110'
                      }`}
                  />
                ))}
              </div>
            </div>

            {/* Pattern Style */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Settings className="w-3 h-3" />
                Pattern
              </label>
              <select
                value={dotStyle}
                onChange={(e) => setDotStyle(e.target.value as DotType)}
                className="w-full text-sm bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              >
                {DOT_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Corner Style */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Maximize2 className="w-3 h-3" />
                Corners
              </label>
              <select
                value={cornerStyle}
                onChange={(e) => setCornerStyle(e.target.value as CornerSquareType)}
                className="w-full text-sm bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              >
                {CORNER_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Size Slider */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                Size: {qrSize}px
              </label>
              <input
                type="range"
                min="150"
                max="350"
                value={qrSize}
                onChange={(e) => setQrSize(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-current"
                style={{ accentColor: accentColor.value }}
              />
            </div>

          </div>
        </div>
      </div>

      {/* --- Grid View --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
        {tables.map((table) => (
          <div
            key={table.id}
            className="group relative bg-white dark:bg-slate-800 rounded-[2rem] shadow-lg border border-slate-100 dark:border-slate-700 overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-1"
          >
            {/* Decorative Header */}
            <div className={`h-32 ${accentColor.class} relative overflow-hidden flex flex-col items-center justify-center`}>
              {/* Elegant Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"></div>

              {/* Abstract Circular Pattern */}
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-black/10 rounded-full blur-2xl"></div>

              <div className="relative z-10 text-center text-white">
                <p className="text-white/80 font-medium text-xs uppercase tracking-[0.2em] mb-1">
                  Table
                </p>
                <h3 className="text-4xl font-medium tracking-tight">
                  {table.number}
                </h3>
                <div className="mt-2 text-white/70 text-xs flex items-center justify-center gap-1.5 opacity-80">
                  <span className="w-1 h-1 rounded-full bg-white/50"></span>
                  <span>{table.capacity} Guests</span>
                  <span className="w-1 h-1 rounded-full bg-white/50"></span>
                </div>
              </div>
            </div>

            {/* QR Card Body */}
            <div className="px-8 pb-8 -mt-12 relative z-10">
              <div className="bg-white dark:bg-slate-700 rounded-2xl shadow-xl p-4 mb-6 transform transition-transform group-hover:scale-[1.02]">
                <div className="aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-600 group-hover:border-solid group-hover:border-emerald-500/50 transition-all">

                  {/* Client-side QR Rendering */}
                  <SingleQRCode
                    tableNumber={table.number}
                    size={qrSize * 0.8} // Scale down slightly for card
                    color={accentColor}
                    dotStyle={dotStyle}
                    cornerStyle={cornerStyle}
                  />

                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowPreview(table)}
                  className="col-span-2 flex items-center justify-center gap-2 py-3 px-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm transition-colors border border-slate-100 dark:border-slate-600"
                >
                  <Eye className="w-4 h-4" />
                  Preview Print
                </button>

                <button
                  onClick={() => copyToClipboard(table.number)}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm transition-colors border border-slate-100 dark:border-slate-600"
                >
                  {copiedTable === table.number ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copiedTable === table.number ? 'Copied' : 'Copy'}
                </button>

                <button
                  onClick={() => downloadQRCode(table.number)}
                  className={`flex items-center justify-center gap-2 py-3 px-4 text-white rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 hover:shadow-lg ${accentColor.class}`}
                >
                  <Download className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* --- Preview & Print Modal --- */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">

            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Printer className="w-5 h-5" />
                Print Preview
              </h3>
              <button
                onClick={() => setShowPreview(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8 bg-slate-100 dark:bg-black/50 overflow-y-auto flex-1 flex flex-col items-center justify-center">

              {/* Print Card Simulation */}
              <div id="printable-card" className="bg-white text-slate-900 w-[300px] shadow-2xl rounded-2xl relative overflow-hidden flex flex-col items-center border border-slate-200 aspect-[3/4]">

                {/* Header matching main design */}
                <div className={`h-40 w-full ${accentColor.class} relative overflow-hidden flex flex-col items-center justify-center`}>
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"></div>
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-black/10 rounded-full blur-2xl"></div>

                  <div className="relative z-10 text-center text-white mt-4">
                    <p className="text-white/80 font-medium text-xs uppercase tracking-[0.2em] mb-2">
                      Table
                    </p>
                    <h3 className="text-5xl font-medium tracking-tight">
                      {showPreview.number}
                    </h3>
                  </div>
                </div>

                <div className="flex-1 w-full flex flex-col items-center justify-center p-8 -mt-10 relative z-10">
                  <div className="bg-white p-4 rounded-2xl shadow-xl mb-6">
                    <SingleQRCode
                      tableNumber={showPreview.number}
                      size={180}
                      color={accentColor}
                      dotStyle={dotStyle}
                      cornerStyle={cornerStyle}
                    />
                  </div>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">Scan to Order</p>
                  <p className="text-xs text-slate-400">Bon Appétit</p>
                </div>

                <div className="mb-6">
                  <p className="text-[10px] font-medium text-slate-300 uppercase tracking-widest">Powered by Bolt QR</p>
                </div>
              </div>

            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-3">
              <button
                onClick={() => setShowPreview(null)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => downloadQRCode(showPreview.number)}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${accentColor.class}`}
              >
                <Download className="w-5 h-5" />
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRGenerator;
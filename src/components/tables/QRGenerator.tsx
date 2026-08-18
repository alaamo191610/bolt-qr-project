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
import type { Options } from 'qr-code-styling';
import toast from 'react-hot-toast';
import {
  QrCode,
  Download,
  Copy,
  Check,
  Printer,
  Palette,
  Maximize2,
  Settings,
  Users,
  Link2,
  Smartphone,
  RefreshCw,
  Ban
} from 'lucide-react';
import { tableService } from '../../services/tableService';
import { getErrorMessage } from '../../utils/errors';

interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
  adminId: string;
}

interface QRGeneratorProps {
  tables: Table[];
  capabilities: Record<number, GeneratedCapability>;
  setCapabilities: React.Dispatch<React.SetStateAction<Record<number, GeneratedCapability>>>;
}

interface GeneratedCapability {
  capability: string;
  version: number;
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

// The QR encodes a rotatable, revocable capability secret rather than the
// predictable table/restaurant identity — see docs/contracts/table-capability.md.
// `restaurant`/`table` stay in the link too so the menu can load/display before
// the capability exchange resolves; only `cap` authorizes placing an order.
const buildMenuUrl = (tableCode: string, adminId: string, capability: string) => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams({ table: tableCode, restaurant: adminId, cap: capability });
  return `${window.location.origin}/menu?${params.toString()}`;
};

// Helper component for rendering a single QR
const SingleQRCode = ({
  tableCode,
  adminId,
  capability,
  size,
  color,
  dotStyle,
  cornerStyle,
  logo
}: {
  tableCode: string;
  adminId: string;
  capability: string;
  size: number;
  color: { value: string; gradient: string[] };
  dotStyle: DotType;
  cornerStyle: CornerSquareType;
  logo?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const menuURL = buildMenuUrl(tableCode, adminId, capability);

    const qrOptions: Partial<Options> = {
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
  }, [tableCode, adminId, capability, size, color, dotStyle, cornerStyle, logo]);

  return <div ref={ref} className="qr-container" />;
};


const QRGenerator: React.FC<QRGeneratorProps> = ({ tables, capabilities, setCapabilities }) => {
  const [qrSize, setQrSize] = useState(250);
  const [accentColor, setAccentColor] = useState(COLORS[0]);
  const [dotStyle, setDotStyle] = useState<DotType>('rounded');
  const [cornerStyle, setCornerStyle] = useState<CornerSquareType>('extra-rounded');
  const [copiedTable, setCopiedTable] = useState<string>('');

  // Session-only: the raw capability secret is returned once by the rotate
  // endpoint and is never retrievable again, so it only ever lives in memory
  // here — never persisted. Losing it on refresh is intentional.
  const [pendingGenerate, setPendingGenerate] = useState<Table | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<Table | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const generateCapability = async (table: Table) => {
    setPendingGenerate(null);
    setGeneratingId(table.id);
    try {
      const result = await tableService.rotateCapability(table.id);
      setCapabilities((prev) => ({
        ...prev,
        [table.id]: { capability: result.capability, version: result.version },
      }));
      toast.success('New QR code generated. Print or share it now — it will not be shown again.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate a new QR code.'));
    } finally {
      setGeneratingId(null);
    }
  };

  const revokeCapability = async (table: Table) => {
    setPendingRevoke(null);
    setRevokingId(table.id);
    try {
      await tableService.revokeCapability(table.id);
      setCapabilities((prev) => {
        const next = { ...prev };
        delete next[table.id];
        return next;
      });
      toast.success('Ordering disabled for this table until a new QR code is generated.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not disable this table right now.'));
    } finally {
      setRevokingId(null);
    }
  };

  // For the actual download method, we instantiate a temporary QR logic
  const downloadQRCode = async (table: Table, format: 'png' | 'svg' = 'png') => {
    const capability = capabilities[table.id]?.capability;
    if (!capability) {
      toast.error('Generate a QR code for this table first.');
      return;
    }
    const menuURL = buildMenuUrl(table.number, table.adminId, capability);

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

    await qr.download({ name: `Table-${table.number}-Menu-QR`, extension: format });
  };

  const copyToClipboard = async (table: Table) => {
    const capability = capabilities[table.id]?.capability;
    if (!capability) {
      toast.error('Generate a QR code for this table first.');
      return;
    }
    const menuURL = buildMenuUrl(table.number, table.adminId, capability);

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

        let copied: boolean;
        try {
          copied = document.execCommand('copy');
        } finally {
          document.body.removeChild(textArea);
        }
        if (!copied) throw new Error('execCommand copy returned false');
      }

      setCopiedTable(table.number);
      setTimeout(() => setCopiedTable(''), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      toast.error('Could not copy the link. Please copy it manually.');
    }
  };

  const printQRCode = (table: Table) => {
    const capability = capabilities[table.id]?.capability;
    if (!capability) {
      toast.error('Generate a QR code for this table first.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=480,height=720');
    if (!printWindow) {
      toast.error('Please allow pop-ups to print the QR code.');
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Table QR Code</title>
          <style>
            @page { margin: 0.5in; }
            body { margin: 0; display: flex; justify-content: center; }
            .card { width: 3.5in; padding: 0.35in; text-align: center; font-family: Arial, sans-serif; color: #0f172a; }
            .label { margin: 0 0 0.2in; font-size: 24px; font-weight: 700; }
            .qr { display: flex; justify-content: center; }
            .hint { margin-top: 0.2in; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <main class="card">
            <h1 id="table-label" class="label"></h1>
            <div id="qr-print" class="qr"></div>
            <p class="hint">Scan to view menu &amp; order</p>
          </main>
        </body>
      </html>
    `);
    printWindow.document.close();
    const label = printWindow.document.getElementById('table-label');
    const qrContainer = printWindow.document.getElementById('qr-print');
    if (!label || !qrContainer) {
      printWindow.close();
      toast.error('Could not prepare the QR code for printing.');
      return;
    }

    label.textContent = `Table ${table.number}`;
    const menuURL = buildMenuUrl(table.number, table.adminId, capability);
    const qr = new QRCodeStyling({
      width: 360,
      height: 360,
      type: 'svg' as DrawType,
      data: menuURL,
      margin: 10,
      qrOptions: {
        typeNumber: 0 as TypeNumber,
        mode: 'Byte' as Mode,
        errorCorrectionLevel: 'Q' as ErrorCorrectionLevel,
      },
      dotsOptions: {
        color: accentColor.value,
        type: dotStyle,
        gradient: {
          type: 'linear',
          rotation: 45,
          colorStops: [
            { offset: 0, color: accentColor.gradient[0] },
            { offset: 1, color: accentColor.gradient[1] },
          ],
        },
      },
      cornersSquareOptions: {
        type: cornerStyle,
        color: accentColor.value,
      },
      cornersDotOptions: {
        type: cornerStyle === 'square' ? 'square' : 'dot',
        color: accentColor.value,
      },
      backgroundOptions: { color: '#ffffff' },
    });
    qr.append(qrContainer);
    printWindow.focus();
    printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
    window.setTimeout(() => printWindow.print(), 400);
  };

  return (
    <div className="space-y-8 animate-fade-in p-2">

      {/* --- Controls Header --- */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 sticky top-4 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 supports-[backdrop-filter]:bg-white/60">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">

          <div className="flex items-center gap-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 transition-transform hover:rotate-6"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
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
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Palette className="w-3 h-3" />
                Color
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="QR code color">
                {COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => setAccentColor(color)}
                    aria-label={color.name}
                    aria-pressed={accentColor.name === color.name}
                    className={`w-6 h-6 rounded-full transition-all duration-300 relative group ${color.class} ${accentColor.name === color.name ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110' : 'hover:scale-110'
                      }`}
                  />
                ))}
              </div>
            </div>

            {/* Pattern Style */}
            <div className="space-y-3">
              <label htmlFor="qr-pattern" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Settings className="w-3 h-3" />
                Pattern
              </label>
              <select
                id="qr-pattern"
                value={dotStyle}
                onChange={(e) => setDotStyle(e.target.value as DotType)}
                className="w-full text-sm bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              >
                {DOT_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Corner Style */}
            <div className="space-y-3">
              <label htmlFor="qr-corners" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Maximize2 className="w-3 h-3" />
                Corners
              </label>
              <select
                id="qr-corners"
                value={cornerStyle}
                onChange={(e) => setCornerStyle(e.target.value as CornerSquareType)}
                className="w-full text-sm bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              >
                {CORNER_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Size Slider */}
            <div className="space-y-3">
              <label htmlFor="qr-size" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                Size: {qrSize}px
              </label>
              <input
                id="qr-size"
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {tables.map((table) => {
          const generated = capabilities[table.id];
          const isGenerating = generatingId === table.id;
          const isRevoking = revokingId === table.id;

          return (
            <div
              key={table.id}
              className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
            >
              <div
                className="h-1.5 w-full"
                style={{ background: `linear-gradient(90deg, ${accentColor.gradient[0]}, ${accentColor.gradient[1]})` }}
              />

              <div className="p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow-md"
                      style={{ background: `linear-gradient(135deg, ${accentColor.gradient[0]}, ${accentColor.gradient[1]})` }}
                    >
                      {table.number}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Dining table</p>
                      <h3 className="truncate text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        Table {table.number}
                      </h3>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${getTableStatusStyles(table.status)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {table.status || 'available'}
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-10 blur-2xl"
                    style={{ backgroundColor: accentColor.value }}
                  />
                  <div
                    className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full opacity-10 blur-2xl"
                    style={{ backgroundColor: accentColor.gradient[1] }}
                  />
                  {generated ? (
                    <>
                      <div className="relative mx-auto flex w-fit items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-transform duration-300 group-hover:scale-[1.015]">
                        <SingleQRCode
                          tableCode={table.number}
                          adminId={table.adminId}
                          capability={generated.capability}
                          size={Math.min(qrSize * 0.76, 220)}
                          color={accentColor}
                          dotStyle={dotStyle}
                          cornerStyle={cornerStyle}
                        />
                      </div>
                      <div className="relative mt-4 flex items-center justify-center gap-2 text-center">
                        <Smartphone className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scan to view menu &amp; order</p>
                      </div>
                    </>
                  ) : (
                    <div className="relative flex flex-col items-center justify-center gap-3 py-10 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200/70 dark:bg-slate-700/60">
                        <QrCode className="h-7 w-7 text-slate-400" />
                      </div>
                      <p className="max-w-[16rem] text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Generate a QR code to preview, print, or share it for this table
                      </p>
                    </div>
                  )}
                </div>

                <div className="my-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-700/40">
                    <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Users className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Capacity</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{table.capacity} guests</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-700/40">
                    <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Link2 className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Menu link</span>
                    </div>
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">Table {table.number}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {generated && (
                    <>
                      <button
                        onClick={() => copyToClipboard(table)}
                        className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                      >
                        {copiedTable === table.number ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        {copiedTable === table.number ? 'Copied' : 'Copy'}
                      </button>

                      <button
                        onClick={() => downloadQRCode(table)}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                        style={{ background: `linear-gradient(135deg, ${accentColor.gradient[0]}, ${accentColor.gradient[1]})` }}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </button>

                      <button
                        onClick={() => printQRCode(table)}
                        className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Printer className="h-4 w-4" />
                        Print QR code
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => setPendingGenerate(table)}
                    disabled={isGenerating}
                    className={`${generated ? '' : 'col-span-2'} flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
                  >
                    <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                    {isGenerating ? 'Generating…' : 'Generate new QR code'}
                  </button>

                  {generated && (
                    <button
                      onClick={() => setPendingRevoke(table)}
                      disabled={isRevoking}
                      className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 transition-all hover:bg-rose-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                    >
                      <Ban className="h-4 w-4" />
                      {isRevoking ? 'Disabling…' : 'Disable ordering'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- Generate confirmation --- */}
      {pendingGenerate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scale-in text-center">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Generate a new QR code?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              This creates a new code for Table {pendingGenerate.number} and immediately invalidates
              any QR code currently printed or shared for this table.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingGenerate(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => generateCapability(pendingGenerate)}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/30 transition-all"
              >
                Generate it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Revoke confirmation --- */}
      {pendingRevoke && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scale-in text-center">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Ban className="w-8 h-8 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Disable ordering for this table?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              Customers won't be able to order from Table {pendingRevoke.number} until you generate
              a new QR code.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingRevoke(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={() => revokeCapability(pendingRevoke)}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-500/30 transition-all"
              >
                Disable it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getTableStatusStyles = (status: string) => {
  switch ((status || '').toLowerCase()) {
    case 'occupied':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/25 dark:text-amber-300';
    case 'reserved':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/25 dark:text-blue-300';
    case 'unavailable':
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-300';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-300';
  }
};

export default QRGenerator;

import React, { useState } from 'react';
import { QrCode, Download, Eye, Copy, Check } from 'lucide-react';

interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
}

interface QRGeneratorProps {
  tables: Table[];
}

const QRGenerator: React.FC<QRGeneratorProps> = ({ tables }) => {
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [qrSize, setQrSize] = useState(200);
  const [copiedTable, setCopiedTable] = useState<string>('');

  const generateQRCodeURL = (tableNumber: string) => {
    const baseURL = window.location.origin;
    const menuURL = `${baseURL}/menu?table=${tableNumber}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(menuURL)}`;
  };

  const downloadQRCode = (tableNumber: string) => {
    const qrURL = generateQRCodeURL(tableNumber);
    const link = document.createElement('a');
    link.href = qrURL;
    link.download = `table-${tableNumber}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = async (tableNumber: string) => {
    const baseURL = window.location.origin;
    const menuURL = `${baseURL}/menu?table=${tableNumber}`;
    
    try {
      await navigator.clipboard.writeText(menuURL);
      setCopiedTable(tableNumber);
      setTimeout(() => setCopiedTable(''), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'status-available';
      case 'occupied':
        return 'status-occupied';
      case 'reserved':
        return 'status-reserved';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 card-hover">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white gradient-text">QR Code Generator</h2>
            <p className="text-slate-600 dark:text-slate-400">Generate QR codes for table access to digital menu</p>
          </div>
        </div>

        {/* QR Size Control */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            QR Code Size: {qrSize}px
          </label>
          <input
            type="range"
            min="150"
            max="400"
            value={qrSize}
            onChange={(e) => setQrSize(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${((qrSize - 150) / (400 - 150)) * 100}%, #e2e8f0 ${((qrSize - 150) / (400 - 150)) * 100}%, #e2e8f0 100%)`
            }}
          />
        </div>
      </div>

      {/* Table Grid */}
      <div className="grid mobile-grid tablet-grid lg:grid-cols-3 gap-6">
        {tables.map((table) => (
          <div key={table.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 card-hover">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Table {table.number}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Capacity: {table.capacity} guests</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(table.status)}`}>
                {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
              </span>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-white dark:bg-slate-700 rounded-xl border-2 border-slate-100 dark:border-slate-600 shadow-inner">
                <img
                  src={generateQRCodeURL(table.number)}
                  alt={`QR Code for Table ${table.number}`}
                  className="block"
                  style={{ width: qrSize * 0.8, height: qrSize * 0.8 }}
                />
              </div>
            </div>

            {/* URL Display */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Menu URL:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={`${window.location.origin}/menu?table=${table.number}`}
                  readOnly
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => copyToClipboard(table.number)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-lg transition-colors duration-200"
                  title="Copy URL"
                >
                  {copiedTable === table.number ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={() => downloadQRCode(table.number)}
                className="flex-1 btn-primary"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Download</span>
              </button>
              <button
                onClick={() => window.open(`/menu?table=${table.number}`, '_blank')}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 rounded-xl transition-colors duration-200"
                title="Preview Menu"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-300 mb-3">How to Use QR Codes</h3>
        <div className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
          <p>• Print the QR codes and place them on respective tables</p>
          <p>• Customers scan the QR code with their phone camera</p>
          <p>• They'll be directed to your digital menu for that specific table</p>
          <p>• Orders are automatically associated with the correct table</p>
          <p>• Download high-resolution QR codes for professional printing</p>
        </div>
      </div>
    </div>
  );
};

export default QRGenerator;
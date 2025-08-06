import { PDFDownloadLink } from '@react-pdf/renderer';
import OrderSummaryPDF from './OrderSummaryPDF';
import type { Order } from '../../lib/supabase';

interface OrderWithItems extends Order {
    items: { name: string; quantity: number }[];
  }
  

  const ExportOrdersPDFButton: React.FC<{
    orders: OrderWithItems[];
    t: (key: string) => string;
    language: 'en' | 'ar';
    dateRange?: string;
  }> = ({ orders, t, language, dateRange }) => {
    return (
      <PDFDownloadLink
        document={
          <OrderSummaryPDF
            orders={orders}
            t={t}
            language={language}
            dateRange={dateRange}
          />
        }
        fileName="order-summary.pdf"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        {({ loading }) => (loading ? t('common.loading') : t('analytics.exportPDF'))}
      </PDFDownloadLink>
    );
  };  

export default ExportOrdersPDFButton;
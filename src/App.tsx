import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QrCode, Menu, ShoppingCart, Settings, Users, BarChart3 } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useLanguage } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { adminService } from './services/adminService';
import { tableService } from './services/tableService';
import { menuService } from './services/menuService';
import { orderService } from './services/orderService';
import AuthForm from './components/Auth/AuthForm';
import ResponsiveLayout from './components/ResponsiveLayout';
import ThemeCustomizer from './components/ThemeCustomizer';
import QRGenerator from './components/QRGenerator';
import DigitalMenu from './components/DigitalMenu';
import OrderManagement from './components/OrderManagement';
import TableManagement from './components/TableManagement';
import Analytics from './components/Analytics';
import AdminPanel from './components/AdminPanel';
import CustomerMenu from './pages/CustomerMenu';
import { Toaster } from 'react-hot-toast';
// Define interfaces for the component state
interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
}

interface Order {
  id: number;
  tableNumber: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  total: number;
  status: string;
  timestamp: Date;
}

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
}

interface AdminProfile {
  id: string;
  name?: string;
  email?: string;
  preferred_language?: string;
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <Router>
          <Routes>
            <Route path="/menu" element={<CustomerMenu />} />
            <Route path="/ar/menu" element={<CustomerMenu />} />
            <Route path="/en/menu" element={<CustomerMenu />} />
            <Route path="/menu/:lang" element={<CustomerMenu />} />
            <Route path="/" element={user ? <AdminDashboard /> : <AuthForm />} />
          </Routes>
        </Router>

        {/* 🔔 Toast messages rendered globally */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              padding: '12px 16px',
              fontSize: '0.875rem',
              borderRadius: '0.75rem',
              background: '#ffffff',
              color: '#0f172a',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
            },
            success: {
              iconTheme: {
                primary: '#10b981', // emerald-500
                secondary: '#d1fae5', // emerald-100
              },
              style: {
                background: '#ecfdf5',
                color: '#065f46',
                borderLeft: '4px solid #10b981',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444', // red-500
                secondary: '#fee2e2', // red-100
              },
              style: {
                background: '#fef2f2',
                color: '#991b1b',
                borderLeft: '4px solid #ef4444',
              },
            },
            loading: {
              style: {
                background: '#f0fdfa',
                color: '#0891b2',
                borderLeft: '4px solid #06b6d4', // cyan-500
              },
            },
          }}
        />


      </LanguageProvider>
    </ThemeProvider>
  );
}

const AdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { t, isLoaded } = useLanguage();

  const [activeTab, setActiveTab] = useState('qr-generator');
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (user && !dataLoaded) {
      loadAdminData();
    }
  }, [user, dataLoaded]);

  const loadAdminData = async () => {
    if (!user) return;
    try {
      const profile = await adminService.getAdminProfile(user.id);
      setAdminProfile(profile);

      const adminTables = await tableService.getTables(user.id);
      setTables(adminTables.map((table: any) => ({
        id: parseInt(table.id) || Math.random(),
        number: table.code,
        status: 'available',
        capacity: 4
      })));

      const adminMenuItems = await menuService.getMenuItems(user.id);
      setMenuItems(adminMenuItems.map((item: any) => ({
        id: parseInt(item.id) || Math.random(),
        name: item.name_en,
        description: item.name_ar || item.name_en,
        price: item.price,
        category: item.categories?.name_en || 'Other',
        image: item.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'
      })));

      const adminOrders = await orderService.getOrders(user.id);
      setOrders(adminOrders.map((order: any) => ({
        id: parseInt(order.id) || Math.random(),
        tableNumber: order.table_id,
        items: order.order_items?.map((item: any) => ({
          name: item.menus?.name_en || 'Unknown Item',
          price: item.price_at_order,
          quantity: item.quantity
        })) || [],
        total: order.total || 0,
        status: order.status || 'pending',
        timestamp: new Date(order.created_at)
      })));
    } catch (error) {
      console.error('Error loading admin data:', error);
    }
  };

  // Simple tab change handler
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  const navigation = useMemo(() => [
    { id: 'qr-generator', name: t('nav.qrCodes'), icon: QrCode },
    { id: 'menu', name: t('nav.digitalMenu'), icon: Menu },
    { id: 'orders', name: t('nav.orders'), icon: ShoppingCart },
    { id: 'tables', name: t('nav.tables'), icon: Users },
    { id: 'analytics', name: t('nav.analytics'), icon: BarChart3 },
    { id: 'admin', name: t('nav.admin'), icon: Settings },
  ], [t]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'qr-generator':
        return <QRGenerator tables={tables} />;
      case 'menu':
        return <DigitalMenu />;
      case 'orders':
        return <OrderManagement orders={orders} setOrders={setOrders} />;
      case 'tables':
        return <TableManagement tables={tables} setTables={setTables} onDataChange={loadAdminData} />;
      case 'analytics':
        return <Analytics orders={orders} />;
      case 'admin':
        return <AdminPanel menuItems={menuItems} setMenuItems={setMenuItems} />;
      default:
        return <QRGenerator tables={tables} />;
    }
  };

  return (
    <>
      <ResponsiveLayout
        navigation={navigation}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        userInfo={{
          name: adminProfile?.name || user?.email?.split('@')[0] || 'Restaurant',
          email: user?.email || ''
        }}
        onSignOut={() => user && signOut()}
      >
        {renderContent()}
      </ResponsiveLayout>
      <ThemeCustomizer />
    </>
  );
};

export default App;
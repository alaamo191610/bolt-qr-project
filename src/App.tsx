import React, { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import {
  QrCode,
  Menu,
  ShoppingCart,
  Settings,
  Users,
  BarChart3,
} from "lucide-react";
import { useAuth } from "./providers/AuthProvider";
import { useLanguage } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { adminService } from "./services/adminService";
import { tableService } from "./services/tableService";
import { menuService } from "./services/menuService";
import { orderService } from "./services/orderService";
import AuthForm from "./components/Auth/AuthForm";
import ResponsiveLayout from "./components/common/ResponsiveLayout";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { Toaster, toast } from "react-hot-toast";
import { socket, joinAdminRoom } from "./services/socket";
import {
  isOrderRealtimeEvent,
  type OrderRealtimeEvent,
} from "./services/orderRealtime";

const QRGenerator = React.lazy(() => import("./components/tables/QRGenerator"));
const DigitalMenu = React.lazy(() => import("./components/menu/DigitalMenu"));
const OrderManagement = React.lazy(() => import("./components/orders/OrderManagement"));
const TableManagement = React.lazy(() => import("./components/tables/TableManagement"));
const Analytics = React.lazy(() => import("./components/Analytics"));
const AdminPanel = React.lazy(() => import("./components/admin/AdminPanel"));
const CustomerMenu = React.lazy(() => import("./pages/CustomerMenu"));
const SuperAdminLogin = React.lazy(() => import("./components/super-admin/SuperAdminLogin"));
const SuperAdminDashboard = React.lazy(() => import("./components/super-admin/SuperAdminDashboard"));

const PageFallback = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
  </div>
);
// Define interfaces for the component state
interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
  adminId: string;
}

interface Order {
  id: number;
  order_number?: number;
  tableNumber: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    note?: string | null;
    customizationDetails?: ApiCustomizationDetails;
  }>;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  version?: number;
  timestamp: Date | string;
  type?: 'dine_in' | 'take_away';
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
  restaurant_name?: string;
  email?: string;
  preferred_language?: string;
}

interface ApiTable {
  id: number;
  code: string;
  status?: string;
  capacity?: number;
  admin_id?: string;
}

interface ApiOrderItem {
  menu?: { name_en?: string } | null;
  price_at_order: number;
  quantity: number;
  note?: string | null;
  customization_details?: ApiCustomizationDetails;
}

interface ApiCustomizationDetails {
  ingredients?: Array<{ name_en?: string; action?: string; qty?: number }>;
  options?: Array<{ name_en?: string; qty?: number }>;
  comboChildren?: Array<{ name_en?: string }>;
}

interface ApiOrder {
  id: number;
  order_number?: number;
  table?: { code?: string } | null;
  table_id?: number;
  order_items?: ApiOrderItem[];
  total?: number;
  status?: Order['status'];
  version?: number;
  type?: Order['type'];
  created_at: string;
}

interface ApiMenuItem {
  id: number;
  name_en: string;
  name_ar?: string;
  price: number;
  categories?: { name_en?: string } | null;
  image_url?: string;
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
        <CurrencyProvider>
          <Router>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                {/* Customer Menu Routes */}
                <Route path="/menu" element={<ErrorBoundary scope="customer"><CustomerMenu /></ErrorBoundary>} />
                <Route path="/ar/menu" element={<ErrorBoundary scope="customer"><CustomerMenu /></ErrorBoundary>} />
                <Route path="/en/menu" element={<ErrorBoundary scope="customer"><CustomerMenu /></ErrorBoundary>} />
                <Route path="/menu/:lang" element={<ErrorBoundary scope="customer"><CustomerMenu /></ErrorBoundary>} />

                {/* Super Admin Routes */}
                <Route path="/super-admin/login" element={<ErrorBoundary scope="admin"><SuperAdminLogin /></ErrorBoundary>} />
                <Route path="/super-admin/dashboard" element={<ErrorBoundary scope="admin"><SuperAdminDashboard /></ErrorBoundary>} />

                {/* Main Admin Route */}
                <Route
                  path="/"
                  element={<ErrorBoundary scope="admin">{user ? <AdminDashboard /> : <AuthForm />}</ErrorBoundary>}
                />
              </Routes>
            </Suspense>
          </Router>

          {/* 🔔 Toast messages rendered globally */}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                padding: "12px 16px",
                fontSize: "0.875rem",
                borderRadius: "0.75rem",
                background: "#ffffff",
                color: "#0f172a",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.06)",
              },
              success: {
                iconTheme: {
                  primary: "#10b981", // emerald-500
                  secondary: "#d1fae5", // emerald-100
                },
                style: {
                  background: "#ecfdf5",
                  color: "#065f46",
                  borderLeft: "4px solid #10b981",
                },
              },
              error: {
                iconTheme: {
                  primary: "#ef4444", // red-500
                  secondary: "#fee2e2", // red-100
                },
                style: {
                  background: "#fef2f2",
                  color: "#991b1b",
                  borderLeft: "4px solid #ef4444",
                },
              },
              loading: {
                style: {
                  background: "#f0fdfa",
                  color: "#0891b2",
                  borderLeft: "4px solid #06b6d4", // cyan-500
                },
              },
            }}
          />
        </CurrencyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

const AdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { t, isLoaded } = useLanguage();

  const [activeTab, setActiveTab] = useState("qr-generator");
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [, setMenuItems] = useState<MenuItem[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Individual fetch functions
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await adminService.getAdminProfile(user.id);
      setAdminProfile(profile);
    } catch (e) {
      console.error("Error fetching profile:", e);
    }
  }, [user]);

  const fetchTables = useCallback(async () => {
    if (!user) return;
    try {
      const adminTables = await tableService.getTables(user.id);
      setTables(
        adminTables.map((table: ApiTable) => ({
          id: table.id,
          number: table.code,
          status: table.status || "available",
          capacity: table.capacity || 4,
          adminId: table.admin_id || user.id,
        }))
      );
    } catch (e) {
      console.error("Error fetching tables:", e);
    }
  }, [user]);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    try {
      const adminOrders = await orderService.getOrders(user.id) as unknown as ApiOrder[];
      setOrders(
        adminOrders.map((order: ApiOrder) => ({
          id: order.id,
          order_number: order.order_number,
          tableNumber: String(order.table?.code ?? order.table_id ?? ''),
          items:
            order.order_items?.map((item: ApiOrderItem) => ({
              name: item.menu?.name_en || "Unknown Item",
              price: item.price_at_order,
              quantity: item.quantity,
              note: item.note,
              customizationDetails: item.customization_details,
            })) || [],
          total: order.total || 0,
          status: order.status || "pending",
          version: order.version || 1,
          timestamp: new Date(order.created_at),
          type: order.type,
        }))
      );
    } catch (e) {
      console.error("Error fetching orders:", e);
    }
  }, [user]);

  const fetchMenuItems = useCallback(async () => {
    if (!user) return;
    try {
      const adminMenuItems = await menuService.getMenuItems(user.id) as unknown as ApiMenuItem[];
      setMenuItems(
        adminMenuItems.map((item: ApiMenuItem) => ({
          id: item.id,
          name: item.name_en,
          description: item.name_ar || item.name_en,
          price: item.price,
          category: item.categories?.name_en || "Other",
          image:
            item.image_url ||
            "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300",
        }))
      );
    } catch (e) {
      console.error("Error fetching menu items:", e);
    }
  }, [user]);

  // Initial Data Load (Profile)
  useEffect(() => {
    if (user && !dataLoaded) {
      fetchProfile();
      setDataLoaded(true);
    }
  }, [user, dataLoaded, fetchProfile]);

  // Tab-specific Data Loading
  useEffect(() => {
    if (!user) return;

    // Always fetch profile on mount (handled above), but dependent data fetches:
    switch (activeTab) {
      case 'qr-generator':
        fetchTables();
        break;
      case 'orders':
        fetchOrders();
        break;
      case 'tables':
        fetchTables();
        break;
      case 'analytics':
        fetchOrders();
        break;
      case 'admin':
        fetchMenuItems();
        break;
      // 'menu' loads its own data internally
      // 'users' (future)
    }
  }, [activeTab, user, fetchTables, fetchOrders, fetchMenuItems]);

  // Real-time Orders
  useEffect(() => {
    if (!user) return;

    joinAdminRoom();

    const handleConnect = () => {
      // Socket.IO room membership does not survive a disconnect/reconnect;
      // without this, table/order updates silently stop arriving after any
      // network blip until the page is refreshed.
      joinAdminRoom();
      void fetchOrders();
    };

    const handleNewOrder = (event: OrderRealtimeEvent<ApiOrder>) => {
      if (!isOrderRealtimeEvent(event)) return;
      const order = event.orderRepresentation;
      if (!order) {
        void fetchOrders();
        return;
      }
      const transformedOrder: Order = {
        id: order.id,
        order_number: order.order_number,
        tableNumber: String(order.table?.code ?? order.table_id ?? ''),
        items: order.order_items?.map((item: ApiOrderItem) => ({
          name: item.menu?.name_en || "Unknown Item",
          price: item.price_at_order,
          quantity: item.quantity,
          note: item.note,
          customizationDetails: item.customization_details,
        })) || [],
        total: order.total || 0,
        status: order.status || "pending",
        version: event.order.version,
        timestamp: new Date(order.created_at),
        type: order.type,
      };

      setOrders((prev) => prev.some(existing => existing.id === transformedOrder.id)
        ? prev.map(existing => existing.id === transformedOrder.id ? transformedOrder : existing)
        : [transformedOrder, ...prev]);
      toast.success(`New Order #${order.order_number || order.id} received!`);
      void fetchOrders();
    };

    const handleStatusUpdate = (event: OrderRealtimeEvent) => {
      if (!isOrderRealtimeEvent(event)) return;
      setOrders(prev => prev.map(order => (
        order.id === event.order.id && event.order.version > (order.version ?? 0)
          ? { ...order, status: event.order.status as Order['status'], version: event.order.version }
          : order
      )));
      void fetchOrders();
    };

    socket.on("connect", handleConnect);
    socket.on("order.created.v1", handleNewOrder);
    socket.on("order.status.v1", handleStatusUpdate);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("order.created.v1", handleNewOrder);
      socket.off("order.status.v1", handleStatusUpdate);
    };
  }, [user, fetchOrders]);

  // Simple tab change handler
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  const navigation = useMemo(
    () => [
      { id: "qr-generator", name: t("nav.qrCodes"), icon: QrCode },
      { id: "menu", name: t("nav.digitalMenu"), icon: Menu },
      { id: "orders", name: t("nav.orders"), icon: ShoppingCart },
      { id: "tables", name: t("nav.tables"), icon: Users },
      { id: "analytics", name: t("nav.analytics"), icon: BarChart3 },
      { id: "admin", name: t("nav.admin"), icon: Settings },
    ],
    [t]
  );

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-slate-600">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "qr-generator":
        return <QRGenerator tables={tables} />;
      case "menu":
        return <DigitalMenu />;
      case "orders":
        return (
          <OrderManagement
            orders={orders}
            setOrders={setOrders}
            onStatusChange={async (orderId, newStatus) => {
              try {
                await orderService.updateOrderStatus(String(orderId), newStatus);
                toast.success(`Order #${orderId} marked as ${newStatus}`);
              } catch (error) {
                console.error("Failed to update status:", error);
                toast.error("Failed to update status");
                // Revert local state if needed (or reload data)
                fetchOrders();
              }
            }}
          />
        );
      case "tables":
        return (
          <TableManagement
            tables={tables}
            setTables={setTables}
            onDataChange={fetchTables}
            onOpenQrStudio={() => handleTabChange("qr-generator")}
          />
        );
      case "analytics":
        return <Analytics orders={orders} />;
      case "admin":
        return <AdminPanel adminId={user?.id || ''} />;
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
          id: user?.id || "",
          name:
            adminProfile?.restaurant_name || adminProfile?.name || user?.email?.split("@")[0] || "Restaurant",
          email: user?.email || "",
        }}
        onSignOut={() => user && signOut()}
      >
        {renderContent()}
      </ResponsiveLayout>
    </>
  );
};

export default App;

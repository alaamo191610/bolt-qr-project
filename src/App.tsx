import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import {
  QrCode,
  Menu,
  ShoppingCart,
  Settings,
  Users,
  BarChart3,
  UserCog,
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
import ThemeCustomizer from "./components/common/ThemeCustomizer";
import QRGenerator from "./components/tables/QRGenerator";
import DigitalMenu from "./components/menu/DigitalMenu";
import OrderManagement from "./components/orders/OrderManagement";
import TableManagement from "./components/tables/TableManagement";
import UserManagement from "./components/admin/UserManagement";
import Analytics from "./components/Analytics";
import AdminPanel from "./components/admin/AdminPanel";
import CustomerMenu from "./pages/CustomerMenu";
import SuperAdminLogin from "./components/super-admin/SuperAdminLogin";
import SuperAdminDashboard from "./components/super-admin/SuperAdminDashboard";
import { Toaster, toast } from "react-hot-toast";
import { socket, joinAdminRoom } from "./services/socket";
// Define interfaces for the component state
interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
}

interface Order {
  id: number;
  order_number?: number;
  tableNumber: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
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
        <CurrencyProvider>
          <Router>
            <Routes>
              {/* Customer Menu Routes */}
              <Route path="/menu" element={<CustomerMenu />} />
              <Route path="/ar/menu" element={<CustomerMenu />} />
              <Route path="/en/menu" element={<CustomerMenu />} />
              <Route path="/menu/:lang" element={<CustomerMenu />} />

              {/* Super Admin Routes */}
              <Route path="/super-admin/login" element={<SuperAdminLogin />} />
              <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />

              {/* Main Admin Route */}
              <Route
                path="/"
                element={user ? <AdminDashboard /> : <AuthForm />}
              />
            </Routes>
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
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
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
        adminTables.map((table: any) => ({
          id: table.id,
          number: table.code,
          status: "available",
          capacity: 4,
        }))
      );
    } catch (e) {
      console.error("Error fetching tables:", e);
    }
  }, [user]);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    try {
      const adminOrders = await orderService.getOrders(user.id);
      setOrders(
        adminOrders.map((order: any) => ({
          id: order.id,
          order_number: order.order_number,
          tableNumber: order.table?.code || order.table_id,
          items:
            order.order_items?.map((item: any) => ({
              name: item.menu?.name_en || "Unknown Item",
              price: item.price_at_order,
              quantity: item.quantity,
            })) || [],
          total: order.total || 0,
          status: order.status || "pending",
          timestamp: new Date(order.created_at),
        }))
      );
    } catch (e) {
      console.error("Error fetching orders:", e);
    }
  }, [user]);

  const fetchMenuItems = useCallback(async () => {
    if (!user) return;
    try {
      const adminMenuItems = await menuService.getMenuItems(user.id);
      setMenuItems(
        adminMenuItems.map((item: any) => ({
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

    joinAdminRoom(user.id);

    const handleNewOrder = (order: any) => {
      const transformedOrder: Order = {
        id: order.id,
        order_number: order.order_number,
        tableNumber: order.table?.code || order.table_id,
        items: order.order_items?.map((item: any) => ({
          name: item.menu?.name_en || "Unknown Item",
          price: item.price_at_order,
          quantity: item.quantity,
        })) || [],
        total: order.total || 0,
        status: order.status || "pending",
        timestamp: new Date(order.created_at),
      };

      setOrders((prev) => [transformedOrder, ...prev]);
      toast.success(`New Order #${order.order_number || order.id} received!`);
    };

    socket.on("new-order", handleNewOrder);

    return () => {
      socket.off("new-order", handleNewOrder);
    };
  }, [user]);

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
      { id: "users", name: "Users", icon: UserCog },
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
          />
        );
      case "users":
        return <UserManagement />;
      case "analytics":
        return <Analytics orders={orders} />;
      case "admin":
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
          name:
            adminProfile?.name || user?.email?.split("@")[0] || "Restaurant",
          email: user?.email || "",
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

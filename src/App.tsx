import React, {
  Suspense,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
import {
  adminService,
  type AdminProfileResponse,
  type AnalyticsSummary,
} from "./services/adminService";
import { tableService, type ApiTable } from "./services/tableService";
import { menuService } from "./services/menuService";
import {
  orderService,
  type ApiOrder,
  type ApiOrderItem,
} from "./services/orderService";
import AuthForm from "./components/Auth/AuthForm";
import ResponsiveLayout from "./components/common/ResponsiveLayout";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { Toaster, toast } from "react-hot-toast";
import { socket, joinAdminRoom } from "./services/socket";
import { getErrorMessage } from "./utils/errors";
import { isUnauthenticatedError } from "./services/api";
import {
  isOrderRealtimeEvent,
  type OrderRealtimeEvent,
} from "./services/orderRealtime";
import { useSubscription } from "./hooks/useSubscription";
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from "./types/subscription";
import type { KDSPrefs } from "./order-admin/types";
import {
  playNotificationSound,
  unlockNotificationAudio,
  type NotificationSoundPreset,
} from "./services/notificationSound";

const QRGenerator = React.lazy(() => import("./components/tables/QRGenerator"));
const DigitalMenu = React.lazy(() => import("./components/menu/DigitalMenu"));
const OrderManagement = React.lazy(
  () => import("./components/orders/OrderManagement"),
);
const OrderingStatusControl = React.lazy(
  () => import("./components/orders/OrderingStatusControl"),
);
const TableManagement = React.lazy(
  () => import("./components/tables/TableManagement"),
);
const Analytics = React.lazy(() => import("./components/Analytics"));
const AdminPanel = React.lazy(() => import("./components/admin/AdminPanel"));
const TeamManagement = React.lazy(
  () => import("./components/team/TeamManagement"),
);
const CustomerMenu = React.lazy(() => import("./pages/CustomerMenu"));
const SuperAdminLogin = React.lazy(
  () => import("./components/super-admin/SuperAdminLogin"),
);
const SuperAdminDashboard = React.lazy(
  () => import("./components/super-admin/SuperAdminDashboard"),
);
const ActivationForm = React.lazy(
  () => import("./components/Auth/ActivationForm"),
);

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

interface GeneratedCapability {
  capability: string;
  version: number;
}

const getStoredQrCapabilities = (
  userId?: string,
): Record<number, GeneratedCapability> => {
  if (!userId || typeof window === "undefined") return {};

  try {
    const stored = window.sessionStorage.getItem(
      `bolt-qr:capabilities:${userId}`,
    );
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([tableId, value]) =>
          /^\d+$/.test(tableId) &&
          Boolean(value) &&
          typeof value === "object" &&
          typeof (value as { capability?: unknown }).capability === "string" &&
          typeof (value as { version?: unknown }).version === "number",
      ),
    ) as Record<number, GeneratedCapability>;
  } catch {
    return {};
  }
};

const ADMIN_TAB_IDS = new Set([
  "qr-generator",
  "menu",
  "orders",
  "tables",
  "analytics",
  "team",
  "admin",
]);

const getStoredAdminTab = (userId?: string) => {
  if (!userId || typeof window === "undefined") return "qr-generator";

  try {
    const storedTab = window.localStorage.getItem(`bolt-qr:last-tab:${userId}`);
    return storedTab && ADMIN_TAB_IDS.has(storedTab)
      ? storedTab
      : "qr-generator";
  } catch {
    return "qr-generator";
  }
};

interface Order {
  id: number;
  order_number?: number;
  tableNumber: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    note?: string | null;
    customizationDetails?: ApiOrderItem["customization_details"];
  }>;
  total: number;
  status: "pending" | "preparing" | "ready" | "served" | "cancelled";
  version?: number;
  timestamp: Date | string;
  type?: "dine_in" | "take_away";
  paymentMethod?: "cash" | "card_machine";
}

// menuItems/setMenuItems below is currently write-only (never rendered),
// but id must still match menuService's real AdminMenuItem.id: string.
interface MenuItem {
  id: string;
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
  email: string;
  preferred_language?: string;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  subscription_end: string | null;
  trial_ends_at: string | null;
  max_tables: number;
  max_menu_items: number;
  max_staff_accounts: number;
  created_at: string;
  kds_prefs?: Pick<KDSPrefs, "soundEnabled" | "soundPreset"> | null;
}

// Accepts ApiOrder (the wider, raw-wire type - Decimal fields serialize as
// strings over JSON), not just MappedOrder (getOrdersPage's own already-
// coerced result): the real-time socket handler below pushes the same raw
// presentPublicOrder() shape the POST /api/orders response uses, which
// never goes through getOrdersPage's Number(...) coercion. Coercing here too
// keeps this correct for both callers instead of only the REST-fetched path.
const mapApiOrder = (order: ApiOrder): Order => ({
  id: order.id,
  order_number: order.order_number,
  tableNumber: String(order.table?.code ?? order.table_id ?? ""),
  items:
    order.order_items?.map((item: ApiOrderItem) => ({
      name: item.menu?.name_en || "Unknown Item",
      price: Number(item.price_at_order) || 0,
      quantity: item.quantity ?? 1,
      note: item.note,
      customizationDetails: item.customization_details,
    })) || [],
  total: Number(order.total) || 0,
  status: (order.status || "pending") as Order["status"],
  version: order.version || 1,
  timestamp: new Date(order.created_at),
  type: order.type,
  paymentMethod:
    order.payment_method === "CARD_MACHINE"
      ? "card_machine"
      : order.payment_method === "CASH"
        ? "cash"
        : undefined,
});

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
                <Route
                  path="/menu"
                  element={
                    <ErrorBoundary scope="customer">
                      <CustomerMenu />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/ar/menu"
                  element={
                    <ErrorBoundary scope="customer">
                      <CustomerMenu />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/en/menu"
                  element={
                    <ErrorBoundary scope="customer">
                      <CustomerMenu />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/menu/:lang"
                  element={
                    <ErrorBoundary scope="customer">
                      <CustomerMenu />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/activate"
                  element={
                    <ErrorBoundary scope="admin">
                      <ActivationForm />
                    </ErrorBoundary>
                  }
                />

                {/* Super Admin Routes */}
                <Route
                  path="/super-admin/login"
                  element={
                    <ErrorBoundary scope="admin">
                      <SuperAdminLogin />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/super-admin/dashboard"
                  element={
                    <ErrorBoundary scope="admin">
                      <SuperAdminDashboard />
                    </ErrorBoundary>
                  }
                />

                {/* Main Admin Route */}
                <Route
                  path="/"
                  element={
                    <ErrorBoundary scope="admin">
                      {user ? <AdminDashboard /> : <AuthForm />}
                    </ErrorBoundary>
                  }
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
  const { user, signOut, organizations, switchOrganization } = useAuth();
  const { t, isLoaded } = useLanguage();

  const [activeTab, setActiveTab] = useState(() => getStoredAdminTab(user?.id));
  const [tables, setTables] = useState<Table[]>([]);
  // Keep generated QR secrets at dashboard scope so changing tabs does not
  // remove the QR from the table card. sessionStorage keeps them through a
  // refresh in this browser tab without making them permanent local data.
  const [qrCapabilities, setQrCapabilities] = useState<
    Record<number, GeneratedCapability>
  >(() => getStoredQrCapabilities(user?.id));
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderScope, setOrderScope] = useState<"active" | "history">("active");
  const [orderNextCursor, setOrderNextCursor] = useState<string | null>(null);
  const [orderHasMore, setOrderHasMore] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const orderRequestRevision = useRef(0);
  const [, setMenuItems] = useState<MenuItem[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [analyticsSummary, setAnalyticsSummary] =
    useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<
    string | null
  >(null);
  const subscription = useSubscription(adminProfile);

  useEffect(() => {
    if (!user?.id) return;

    try {
      window.sessionStorage.setItem(
        `bolt-qr:capabilities:${user.id}`,
        JSON.stringify(qrCapabilities),
      );
    } catch {
      // The in-memory state still keeps the QR available if storage is blocked.
    }
  }, [qrCapabilities, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    try {
      window.localStorage.setItem(`bolt-qr:last-tab:${user.id}`, activeTab);
    } catch {
      // Tab restoration is optional if browser storage is unavailable.
    }
  }, [activeTab, user?.id]);

  useEffect(() => {
    const unlockAudio = () => {
      void unlockNotificationAudio();
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const handleSwitchOrganization = useCallback(
    async (organizationId: string) => {
      setSwitchingOrganizationId(organizationId);
      try {
        await switchOrganization(organizationId);
        // The rest of this dashboard's data (tables/orders/menu) is fetched
        // once per mount, not re-keyed off the active organization - a full
        // reload is the simplest way to guarantee everything reloads scoped
        // to the newly active organization instead of showing stale data.
        window.location.reload();
      } catch (error) {
        toast.error(getErrorMessage(error, "Failed to switch organization"));
        setSwitchingOrganizationId(null);
      }
    },
    [switchOrganization],
  );

  // Individual fetch functions
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    try {
      const profile = (await adminService.getAdminProfile(
        user.id,
      )) as AdminProfileResponse;
      setAdminProfile(profile);
    } catch (e) {
      if (isUnauthenticatedError(e)) {
        await signOut();
        return;
      }
      console.error("Error fetching profile:", e);
    }
  }, [signOut, user]);

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
        })),
      );
    } catch (e) {
      console.error("Error fetching tables:", e);
    }
  }, [user]);

  const fetchOrders = useCallback(
    async (
      scope: "active" | "history" = orderScope,
      cursor?: string,
      append = false,
    ) => {
      if (!user) return;
      const requestRevision = ++orderRequestRevision.current;
      if (append) setOrdersLoadingMore(true);
      try {
        const page = await orderService.getOrdersPage(user.id, {
          scope,
          limit: 50,
          cursor,
        });
        if (requestRevision !== orderRequestRevision.current) return;
        const mapped = page.items.map(mapApiOrder);
        setOrders((previous) =>
          append
            ? [
                ...previous,
                ...mapped.filter(
                  (order) =>
                    !previous.some((existing) => existing.id === order.id),
                ),
              ]
            : mapped,
        );
        setOrderNextCursor(page.pagination.nextCursor);
        setOrderHasMore(page.pagination.hasMore);
      } catch (e) {
        if (requestRevision !== orderRequestRevision.current) return;
        console.error("Error fetching orders:", e);
      } finally {
        if (append && requestRevision === orderRequestRevision.current)
          setOrdersLoadingMore(false);
      }
    },
    [user, orderScope],
  );

  const loadMoreOrders = useCallback(async () => {
    if (!orderNextCursor || ordersLoadingMore) return;
    await fetchOrders(orderScope, orderNextCursor, true);
  }, [fetchOrders, orderNextCursor, orderScope, ordersLoadingMore]);

  const handleOrderScopeChange = useCallback((scope: "active" | "history") => {
    orderRequestRevision.current += 1;
    setOrderScope(scope);
    setOrders([]);
    setOrderNextCursor(null);
    setOrderHasMore(false);
    setOrdersLoadingMore(false);
  }, []);

  const fetchMenuItems = useCallback(async () => {
    if (!user) return;
    try {
      const adminMenuItems = await menuService.getMenuItems(user.id);
      setMenuItems(
        adminMenuItems.map((item) => ({
          id: item.id,
          name: item.name_en,
          description: item.name_ar || item.name_en,
          price: item.price,
          category: item.categories?.name_en || "Other",
          image:
            item.image_url ||
            "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300",
        })),
      );
    } catch (e) {
      console.error("Error fetching menu items:", e);
    }
  }, [user]);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      setAnalyticsSummary(await adminService.getAnalytics(user.id, 30));
    } catch (error) {
      console.error("Error fetching bounded analytics:", error);
      setAnalyticsError("Could not load analytics. Please try again.");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [user]);

  // Keep subscription and entitlement data current while the restaurant is open.
  // SuperAdmin changes are persisted centrally, so focus/visibility refreshes and
  // this bounded poll let an existing dashboard reflect them without a reload.
  useEffect(() => {
    if (!user) return;

    void fetchProfile();
    const refreshWhenVisible = () => {
      if (!document.hidden) void fetchProfile();
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user, fetchProfile]);

  // Tab-specific Data Loading
  useEffect(() => {
    if (!user) return;

    // Always fetch profile on mount (handled above), but dependent data fetches:
    switch (activeTab) {
      case "qr-generator":
        fetchTables();
        break;
      case "orders":
        fetchOrders();
        break;
      case "tables":
        fetchTables();
        break;
      case "analytics":
        fetchAnalytics();
        break;
      case "admin":
        fetchMenuItems();
        break;
      // 'menu' loads its own data internally
      // 'users' (future)
    }
  }, [
    activeTab,
    user,
    fetchTables,
    fetchOrders,
    fetchMenuItems,
    fetchAnalytics,
  ]);

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
      if (activeTab === "analytics") void fetchAnalytics();
    };

    const handleNewOrder = (event: OrderRealtimeEvent<ApiOrder>) => {
      if (!isOrderRealtimeEvent(event)) return;
      const order = event.orderRepresentation;
      if (!order) {
        void fetchOrders();
        return;
      }
      const transformedOrder: Order = {
        ...mapApiOrder(order),
        version: event.order.version,
      };

      setOrders((prev) =>
        prev.some((existing) => existing.id === transformedOrder.id)
          ? prev.map((existing) =>
              existing.id === transformedOrder.id ? transformedOrder : existing,
            )
          : [transformedOrder, ...prev],
      );
      toast.success(`New Order #${order.order_number || order.id} received!`);
      if (adminProfile?.kds_prefs?.soundEnabled !== false) {
        void playNotificationSound(
          (adminProfile?.kds_prefs?.soundPreset ||
            "ding") as NotificationSoundPreset,
        );
      }
      void fetchOrders();
      if (activeTab === "analytics") void fetchAnalytics();
    };

    const handleStatusUpdate = (event: OrderRealtimeEvent) => {
      if (!isOrderRealtimeEvent(event)) return;
      setOrders((prev) =>
        prev.map((order) =>
          order.id === event.order.id &&
          event.order.version > (order.version ?? 0)
            ? {
                ...order,
                status: event.order.status as Order["status"],
                version: event.order.version,
              }
            : order,
        ),
      );
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
  }, [user, fetchOrders, fetchAnalytics, activeTab, adminProfile?.kds_prefs]);

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
      // Only OWNER/MANAGER can even load this screen (GET /api/organization/members
      // requires that role); STAFF would just see it 403 on open, so hide it instead.
      ...(user?.role === "OWNER" || user?.role === "MANAGER"
        ? [{ id: "team", name: t("nav.team"), icon: UserCog }]
        : []),
      // Same reasoning as Team: the Admin panel edits pricing, promotions, the
      // restaurant profile, and workflow rules, all of which now require
      // OWNER/MANAGER on the API. Showing it to STAFF only offers 403s.
      ...(user?.role === "OWNER" || user?.role === "MANAGER"
        ? [{ id: "admin", name: t("nav.admin"), icon: Settings }]
        : []),
    ],
    [t, user?.role],
  );

  // A persisted tab from a previous session (or a role change) can point at a
  // screen this member may no longer open. Fall back rather than render a 403.
  useEffect(() => {
    if (!isLoaded || !navigation.length) return;
    if (!navigation.some((item) => item.id === activeTab)) {
      setActiveTab(navigation[0].id);
    }
  }, [isLoaded, navigation, activeTab]);

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
        return (
          <QRGenerator
            tables={tables}
            capabilities={qrCapabilities}
            setCapabilities={setQrCapabilities}
          />
        );
      case "menu":
        return <DigitalMenu />;
      case "orders":
        return (
          <div className="space-y-6">
            <OrderingStatusControl />
            <OrderManagement
              orders={orders}
              setOrders={setOrders}
              hasMore={orderHasMore}
              loadingMore={ordersLoadingMore}
              onLoadMore={loadMoreOrders}
              onViewModeChange={handleOrderScopeChange}
              onStatusChange={async (orderId, newStatus) => {
                try {
                  await orderService.updateOrderStatus(
                    String(orderId),
                    newStatus,
                  );
                  toast.success(`Order #${orderId} marked as ${newStatus}`);
                } catch (error) {
                  console.error("Failed to update status:", error);
                  toast.error("Failed to update status");
                  // Revert local state if needed (or reload data)
                  fetchOrders();
                }
              }}
            />
          </div>
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
        return (
          <Analytics
            summary={analyticsSummary}
            loading={analyticsLoading}
            error={analyticsError}
            onRetry={fetchAnalytics}
          />
        );
      case "team":
        return <TeamManagement />;
      case "admin":
        return <AdminPanel adminId={user?.id || ""} />;
      default:
        return (
          <QRGenerator
            tables={tables}
            capabilities={qrCapabilities}
            setCapabilities={setQrCapabilities}
          />
        );
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
            adminProfile?.restaurant_name ||
            adminProfile?.name ||
            user?.email?.split("@")[0] ||
            "Restaurant",
          email: user?.email || "",
          role: user?.role,
          subscription: adminProfile
            ? {
                planName: subscription.planName,
                status: subscription.isTrial
                  ? "TRIAL"
                  : subscription.isActive
                    ? "ACTIVE"
                    : subscription.isPastDue
                      ? "PAST_DUE"
                      : "CANCELLED",
                hasAccess: subscription.hasAccess,
                daysUntilExpiration: subscription.daysUntilExpiration,
              }
            : undefined,
        }}
        onSignOut={() => user && signOut()}
        organizations={organizations}
        onSwitchOrganization={handleSwitchOrganization}
        switchingOrganizationId={switchingOrganizationId}
      >
        {renderContent()}
      </ResponsiveLayout>
    </>
  );
};

export default App;

import React, { useState, useEffect } from "react";
import { Menu, X, Search, LogOut } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAdminMonetary } from "../../hooks/useAdminMonetary";
import LanguageToggle from "./LanguageToggle";
import { Menu as DropdownMenu, Transition } from "@headlessui/react";
import { Fragment } from "react";

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  navigation: Array<{
    id: string;
    name: string;
    icon: React.ComponentType<any>;
  }>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userInfo?: {
    name: string;
    email: string;
  };
  onSignOut?: () => void;
}

const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  navigation,
  activeTab,
  setActiveTab,
  userInfo,
  onSignOut,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { colors } = useTheme();
  const { t, isRTL } = useLanguage();

  // Extract admin ID from userInfo email to fetch branding
  const adminId = userInfo?.email?.split('@')[0];
  const { restaurantName, logoUrl } = useAdminMonetary(adminId);

  // Prevent component unmounting on tab switch
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - preserve state
        sessionStorage.setItem("activeTab", activeTab);
        sessionStorage.setItem("sidebarOpen", sidebarOpen.toString());
      } else {
        // Tab is visible - restore state if needed
        const savedTab = sessionStorage.getItem("activeTab");
        const savedSidebar = sessionStorage.getItem("sidebarOpen");

        if (savedTab && savedTab !== activeTab) {
          setActiveTab(savedTab);
        }
        if (savedSidebar) {
          setSidebarOpen(savedSidebar === "true");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeTab, sidebarOpen, setActiveTab]);

  // Prevent page refresh on navigation
  const handleTabChange = (tabId: string) => {
    // Mark that we have unsaved state
    sessionStorage.setItem("hasUnsavedChanges", "true");

    const lang = localStorage.getItem("restaurant-language") || "en";
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);

    // Use replaceState instead of pushState to prevent back button issues
    window.history.replaceState({ tab: tabId }, "", url.toString());

    setActiveTab(tabId);
    setSidebarOpen(false);

    // Clear unsaved changes flag after successful navigation
    setTimeout(() => {
      sessionStorage.removeItem("hasUnsavedChanges");
    }, 100);
  };

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (mobile only) */}
      <div
        className={`fixed inset-y-0 ${isRTL ? "right-0" : "left-0"
          } z-50 w-64 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl shadow-2xl transform transition-transform duration-300 ease-in-out border-r border-slate-200 dark:border-slate-700
          ${sidebarOpen
            ? "translate-x-0"
            : isRTL
              ? "translate-x-full"
              : "-translate-x-full"
          } lg:hidden`}
      >
        <div className="flex items-center justify-between h-20 px-6 border-b border-slate-200/50 dark:border-slate-700/50">
          {/* Branding */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={restaurantName || "Restaurant"}
                className="w-10 h-10 rounded-xl object-cover shadow-lg"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" />
                </svg>
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {restaurantName || "RestaurantQR"}
              </h1>
            </div>
          </div>

          {/* Close Sidebar */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  handleTabChange(item.id);
                }}
                className={`w-full flex items-center space-x-3 rtl:space-x-reverse ${isRTL ? "text-right" : "text-left"
                  } px-4 py-3.5 rounded-xl transition-all duration-300 group font-medium ${isActive
                    ? "text-white shadow-lg shadow-emerald-500/20 translate-x-1"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white"
                  }`}
                style={
                  isActive
                    ? {
                      background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                    }
                    : {}
                }
              >
                <Icon className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info in Sidebar */}
        {userInfo && (
          <div className="p-6 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center space-x-3 rtl:space-x-reverse p-3 rounded-xl bg-white dark:bg-slate-700 shadow-sm border border-slate-100 dark:border-slate-600">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center shadow-md">
                <span className="text-white font-bold">{userInfo.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {userInfo.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {userInfo.email}
                </p>
              </div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className={`w-full mt-4 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-colors duration-200 shadow-lg ${isRTL ? "text-right" : "text-center"
                  }`}
              >
                {t("auth.signOut")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Panel */}
      <div className="lg:pl-0 rtl:lg:pl-0 rtl:lg:pr-0">
        {/* Top Header */}
        <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 shadow-sm sticky top-0 z-30 supports-[backdrop-filter]:bg-white/60">
          <div className="flex items-center justify-between h-20 px-4 sm:px-8 max-w-[1920px] mx-auto">
            <div className="flex items-center gap-6 flex-1">
              {/* Sidebar toggle on mobile */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>

              {/* Branding */}
              <div className="hidden lg:flex items-center space-x-3 rtl:space-x-reverse">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={restaurantName || "Restaurant"}
                    className="w-10 h-10 rounded-xl object-cover shadow-lg transform transition-transform hover:scale-105"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transform transition-transform hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                    }}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" />
                    </svg>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {restaurantName || "RestaurantQR"}
                  </h1>
                </div>
              </div>

              {/* Horizontal nav (desktop) */}
              <div className="hidden lg:flex items-center space-x-1 rtl:space-x-reverse ml-4">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleTabChange(item.id);
                      }}
                      className={`flex items-center space-x-2 rtl:space-x-reverse px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 ${isActive
                        ? "text-white shadow-lg shadow-emerald-500/20 scale-105"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                        }`}
                      style={
                        isActive
                          ? {
                            background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                          }
                          : {}
                      }
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden xl:block">{item.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search bar (always visible) */}
              <div className="flex items-center relative w-full max-w-sm ml-auto mr-4 lg:mr-0">
                <Search className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("common.search")}
                  className="w-full py-2.5 pl-11 pr-5 rtl:pr-11 rtl:pl-5 bg-slate-100/50 dark:bg-slate-700/50 border border-transparent focus:border-emerald-500/50 rounded-full text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all duration-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                />
              </div>
            </div>

            {/* Right side: language, bell, user info */}
            <div
              className="flex relative float-right items-center space-x-3 rtl:space-x-reverse ml-4"
            >
              {/* User info (visible on desktop) */}
              {userInfo && (
                <DropdownMenu as="div" className="relative">
                  <DropdownMenu.Button className="flex items-center gap-3 rounded-full bg-slate-50 dark:bg-slate-800/50 p-1.5 pl-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 group">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">
                        {userInfo.name.split(" ")[0]}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                        Admin
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                      <span className="text-sm font-bold text-white">
                        {userInfo.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </DropdownMenu.Button>

                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-200"
                    enterFrom="transform opacity-0 scale-95 translate-y-2"
                    enterTo="transform opacity-100 scale-100 translate-y-0"
                    leave="transition ease-in duration-150"
                    leaveFrom="transform opacity-100 scale-100 translate-y-0"
                    leaveTo="transform opacity-0 scale-95 translate-y-2"
                  >
                    <DropdownMenu.Items
                      className={`absolute z-50 mt-4 w-72 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl shadow-2xl ring-1 ring-black/5 focus:outline-none divide-y divide-slate-100 dark:divide-slate-700 ${isRTL ? "left-0 origin-top-left" : "right-0 origin-top-right"
                        }`}
                    >
                      <div className="px-6 py-5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                          {t("auth.signedInAs") || "Signed in as"}
                        </p>
                        <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {userInfo.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                          {userInfo.email}
                        </p>
                      </div>

                      <div className="p-2">
                        {/* Wrappers for consistent item sizing */}
                        <div className="px-2 py-1">
                          <LanguageToggle />
                        </div>
                      </div>

                      {onSignOut && (
                        <div className="p-2">
                          <DropdownMenu.Item>
                            {({ active }) => (
                              <button
                                onClick={onSignOut}
                                className={`${active
                                  ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                                  : "text-slate-600 dark:text-slate-400"
                                  } group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200`}
                              >
                                <LogOut
                                  className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${isRTL ? 'scale-x-[-1] group-hover:-translate-x-0.5' : ''}`}
                                />
                                {t("auth.signOut")}
                              </button>
                            )}
                          </DropdownMenu.Item>
                        </div>
                      )}
                    </DropdownMenu.Items>
                  </Transition>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-[1920px] mx-auto min-h-[calc(100vh-5rem)]">
          <div className="max-w-8xl mx-auto animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default ResponsiveLayout;

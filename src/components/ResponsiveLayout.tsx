"use client";

import React, { useState, useEffect } from "react";
import { Menu, X, Search, User } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useLanguage } from "../contexts/LanguageContext";
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
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (mobile only) */}
      <div
        className={`fixed inset-y-0 ${
          isRTL ? "right-0" : "left-0"
        } z-50 w-64 bg-white dark:bg-slate-800 shadow-xl transform transition-transform duration-300 ease-in-out
          ${
            sidebarOpen
              ? "translate-x-0"
              : isRTL
              ? "translate-x-full"
              : "-translate-x-full"
          } lg:hidden`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200 dark:border-slate-700">
          {/* Branding */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                RestaurantQR
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Management System
              </p>
            </div>
          </div>

          {/* Close Sidebar */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
          >
            <X className="w-5 h-5" />
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
                className={`w-full flex items-center space-x-3 rtl:space-x-reverse ${
                  isRTL ? "text-right" : "text-left"
                } px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? "text-white shadow-lg transform scale-[1.02]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                }`}
                style={
                  isActive
                    ? {
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                      }
                    : {}
                }
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info in Sidebar */}
        {userInfo && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-3 rtl:space-x-reverse p-3 rounded-xl bg-slate-50 dark:bg-slate-700">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {userInfo.name}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {userInfo.email}
                </p>
              </div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className={`w-full mt-3 px-4 py-2 text-sm text-red-600 hover:text-red-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors duration-200 ${
                  isRTL ? "text-right" : "text-left"
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
        <header className="bg-white dark:bg-slate-800 border-b shadow-sm sticky top-0 z-30">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6">
            <div className="flex items-center gap-4 flex-1">
              {/* Sidebar toggle on mobile */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Branding */}
              <div className="hidden lg:flex items-center space-x-3 rtl:space-x-reverse">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    RestaurantQR
                  </h1>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Management System
                  </p>
                </div>
              </div>

              {/* Horizontal nav (desktop) */}
              <div className="hidden lg:flex items-center space-x-2 rtl:space-x-reverse">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleTabChange(item.id);
                      }}
                      className={`flex items-center space-x-2 rtl:space-x-reverse px-3 py-2 text-sm font-medium rounded-md transition ${
                        isActive
                          ? "text-white shadow-sm"
                          : "text-slate-600 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-white"
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
                      <span className="hidden sm:block">{item.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search bar (always visible) */}
              <div className="flex items-center relative w-48 sm:w-64">
                <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t("common.search")}
                  className="w-full py-2 pl-10 pr-4 rtl:pr-10 rtl:pl-4 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 transition-all duration-200"
                  style={{ outlineColor: colors.primary }}
                />
              </div>
            </div>

            {/* Right side: language, bell, user info */}
            <div
              className="flex relative float-right items-center space-x-4 rtl:space-x-reverse"
              style={{ right: "5%" }}
            >
              {/* User info (visible on desktop) */}
              {userInfo && (
                <DropdownMenu as="div" className="relative">
                  <div>
                    <DropdownMenu.Button className="flex rounded-full bg-slate-100 dark:bg-slate-700 p-1 hover:ring-2 hover:ring-offset-2 hover:ring-emerald-500 focus:outline-none">
                      <span className="sr-only">Open user menu</span>
                      <div className="w-9 h-9 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    </DropdownMenu.Button>
                  </div>

                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <DropdownMenu.Items
                      className={`absolute z-50 mt-2 w-72 origin-top-right rounded-lg bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none ${
                        isRTL ? "left-0" : "right-0"
                      }  `}
                    >
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {userInfo.name}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {userInfo.email}
                        </p>
                      </div>
                      <LanguageToggle />
                      {/* <button className="relative p-2">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1 right-1 rtl:right-auto rtl:left-1 w-2 h-2 bg-red-500 rounded-full" />
                      </button> */}
                      {onSignOut && (
                        <DropdownMenu.Item>
                          {({ active }) => (
                            <button
                              onClick={onSignOut}
                              className={`${
                                active ? "bg-slate-100 dark:bg-slate-700" : ""
                              } w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400`}
                            >
                              {t("auth.signOut")}
                            </button>
                          )}
                        </DropdownMenu.Item>
                      )}
                    </DropdownMenu.Items>
                  </Transition>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default ResponsiveLayout;

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { ROLE_CONFIGS, UserRoleType } from "./types";

interface DashboardLayoutProps {
  children?: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  renderContent?: (props: {
    activeTab: string;
    currentRole: UserRoleType;
    onTabChange: (tabId: string) => void;
  }) => React.ReactNode;
}

export default function DashboardLayout({
  children,
  activeTab: controlledTab,
  onTabChange: controlledOnTabChange,
  renderContent,
}: DashboardLayoutProps) {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  // Sidebar membuka secara default pada desktop dan menjadi drawer tertutup pada mobile.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Active role for testing / preview (defaults to user.role)
  const [currentRole, setCurrentRole] = useState<UserRoleType>("SYSTEM_ADMIN");

  // Active tab state
  const [internalTab, setInternalTab] = useState<string>("pengguna");

  const activeTab = controlledTab ?? internalTab;
  const handleSelectTab = (tabId: string) => {
    if (controlledOnTabChange) {
      controlledOnTabChange(tabId);
    } else {
      setInternalTab(tabId);
    }
  };

  // Sync role with logged-in user
  useEffect(() => {
    if (user?.role) {
      setCurrentRole(user.role);
      const defaultItem = ROLE_CONFIGS[user.role]?.menuItems[0]?.id;
      if (defaultItem) {
        setInternalTab(defaultItem);
      }
    }
  }, [user?.role]);

  // Handle manual role preview change
  const handleRoleChange = (newRole: UserRoleType) => {
    setCurrentRole(newRole);
    const firstItem = ROLE_CONFIGS[newRole]?.menuItems[0]?.id;
    if (firstItem) {
      handleSelectTab(firstItem);
    }
  };

  // Sidenav toggle
  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia("(min-width: 1024px)");
    const syncSidebarWithViewport = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsSidebarOpen(event.matches);
    };

    syncSidebarWithViewport(desktopBreakpoint);
    desktopBreakpoint.addEventListener("change", syncSidebarWithViewport);
    return () => desktopBreakpoint.removeEventListener("change", syncSidebarWithViewport);
  }, []);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-[#475569] font-medium">
            Memuat data sesi AMIGA...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Fixed Header */}
      <Header
        user={user}
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        onLogout={logout}
      />

      {/* Dynamic Sidenav by Role */}
      <Sidebar
        currentRole={currentRole}
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? "lg:pl-60" : "lg:pl-0"
        }`}
      >
        <main className="w-full min-h-[calc(100vh-56px)] pt-14 px-4 sm:px-8 py-6">
          {renderContent
            ? renderContent({
                activeTab,
                currentRole,
                onTabChange: handleSelectTab,
              })
            : children}
        </main>
      </div>
    </div>
  );
}

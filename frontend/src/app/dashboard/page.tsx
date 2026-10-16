"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ServiceLeadView from "@/components/dashboard/ServiceLeadView";

// Every Intake menu has its own route; old ?tab= links redirect there.
const INTAKE_ROUTES: Record<string, string> = {
  invoices: "/invoices",
  upload: "/invoices/upload",
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const tabParam = searchParams.get("tab");
  // Derived from the URL on every render: with cacheComponents the page state survives navigation,
  // so a useState copy would keep the previous tab and the sidebar would not highlight on first click.
  const activeTab = tabParam ?? "pengguna";

  useEffect(() => {
    if (user?.role === "SYSTEM_ADMIN") router.replace("/users");
    if (user?.role === "FINANCE_REVIEWER") router.replace("/reviews");
    if (user?.role === "INTAKE") router.replace(INTAKE_ROUTES[tabParam ?? ""] ?? "/invoices");
    if (user?.role === "SERVICE_LEAD") router.replace("/reviewer-assignments");
  }, [router, tabParam, user?.role]);

  if (user?.role === "SYSTEM_ADMIN" || user?.role === "INTAKE" || user?.role === "FINANCE_REVIEWER" || user?.role === "SERVICE_LEAD") {
    return null;
  }

  return (
    <DashboardLayout
      activeTab={activeTab}
      renderContent={({ currentRole, activeTab: currentTab }) => {
        return (
          <div className="w-full max-w-[1366px] mx-auto">
            {/* Dynamic Content based on Active Role */}
            {currentRole === "SYSTEM_ADMIN" && null}
            {currentRole === "SERVICE_LEAD" && (
              <ServiceLeadView activeTab={currentTab} />
            )}
          </div>
        );
      }}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

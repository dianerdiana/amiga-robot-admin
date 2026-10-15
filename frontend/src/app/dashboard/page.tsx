"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import IntakeView from "@/components/dashboard/IntakeView";
import ReviewerView from "@/components/dashboard/ReviewerView";
import ServiceLeadView from "@/components/dashboard/ServiceLeadView";

// Intake tabs that now have dedicated routes; voucher tabs are still served by the dashboard.
const INTAKE_ROUTES: Record<string, string> = {
  invoices: "/invoices",
  upload: "/invoices/upload",
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>(tabParam ?? "pengguna");

  useEffect(() => {
    if (user?.role === "SYSTEM_ADMIN") router.replace("/users");
    if (user?.role === "INTAKE" && (!tabParam || tabParam in INTAKE_ROUTES)) {
      router.replace(INTAKE_ROUTES[tabParam ?? "invoices"]);
    }
    if (user?.role === "FINANCE_REVIEWER") router.replace("/dashboard/reviewer");
  }, [router, tabParam, user?.role]);

  if (user?.role === "SYSTEM_ADMIN" || user?.role === "INTAKE" || user?.role === "FINANCE_REVIEWER") {
    return null;
  }

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      renderContent={({ currentRole, activeTab: currentTab }) => {
        return (
          <div className="w-full max-w-[1366px] mx-auto">
            {/* Dynamic Content based on Active Role */}
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
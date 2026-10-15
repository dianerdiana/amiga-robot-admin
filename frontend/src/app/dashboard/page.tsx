"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import IntakeView from "@/components/dashboard/IntakeView";
import ReviewerView from "@/components/dashboard/ReviewerView";
import ServiceLeadView from "@/components/dashboard/ServiceLeadView";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("pengguna");

  useEffect(() => {
    if (user?.role === "SYSTEM_ADMIN") router.replace("/users");
  }, [router, user?.role]);

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      renderContent={({ currentRole, activeTab: currentTab }) => {
        return (
          <div className="w-full max-w-[1366px] mx-auto">
            {/* Dynamic Content based on Active Role */}
            {currentRole === "SYSTEM_ADMIN" && null}
            {currentRole === "INTAKE" && <IntakeView activeTab={currentTab} />}
            {currentRole === "FINANCE_REVIEWER" && (
              <ReviewerView activeTab={currentTab} />
            )}
            {currentRole === "SERVICE_LEAD" && (
              <ServiceLeadView activeTab={currentTab} />
            )}
          </div>
        );
      }}
    />
  );
}

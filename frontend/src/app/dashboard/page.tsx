"use client";

import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserManagementView from "@/components/dashboard/UserManagementView";
import IntakeView from "@/components/dashboard/IntakeView";
import ReviewerView from "@/components/dashboard/ReviewerView";
import ServiceLeadView from "@/components/dashboard/ServiceLeadView";
import TokenTestCard from "@/components/dashboard/TokenTestCard";
import { UserRoleType } from "@/components/layout/types";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<string>("pengguna");

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      renderContent={({ currentRole, activeTab: currentTab }) => {
        return (
          <div className="w-full max-w-[1366px] mx-auto">
            {/* Dynamic Content based on Active Role */}
            {currentRole === "SYSTEM_ADMIN" && <UserManagementView />}
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

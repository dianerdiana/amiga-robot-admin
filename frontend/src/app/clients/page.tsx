"use client";

import RequireRole from "@/components/auth/RequireRole";
import ClientManagement from "@/components/clients/ClientManagement";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function ClientsPage() {
  return (
    <RequireRole role="SYSTEM_ADMIN">
      <DashboardLayout activeTab="klien">
        <div className="mx-auto w-full max-w-[1366px]">
          <ClientManagement />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}

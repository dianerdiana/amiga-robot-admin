"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import RequireRole from "@/components/auth/RequireRole";
import UserManagement from "@/components/users/UserManagement";

export default function UsersPage() {
  return (
    <RequireRole role="SYSTEM_ADMIN">
      <DashboardLayout activeTab="pengguna">
        <div className="mx-auto w-full max-w-[1366px]">
          <UserManagement />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}


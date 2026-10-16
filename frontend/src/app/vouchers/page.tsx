"use client";

import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import VoucherList from "@/components/vouchers/VoucherList";

export default function VouchersPage() {
  return (
    <RequireRole role="INTAKE">
      <DashboardLayout activeTab="vouchers">
        <VoucherList />
      </DashboardLayout>
    </RequireRole>
  );
}

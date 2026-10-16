"use client";

import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import VoucherCreate from "@/components/vouchers/VoucherCreate";

export default function VoucherCreatePage() {
  return (
    <RequireRole role="INTAKE">
      <DashboardLayout activeTab="buat-voucher">
        <VoucherCreate />
      </DashboardLayout>
    </RequireRole>
  );
}

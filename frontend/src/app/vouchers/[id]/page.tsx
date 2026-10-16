"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageSpinner } from "@/components/invoices/States";
import VoucherDetailView from "@/components/vouchers/VoucherDetail";

function VoucherDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <VoucherDetailView key={id} voucherId={id} />;
}

export default function VoucherDetailPage() {
  return (
    <RequireRole role="INTAKE">
      <DashboardLayout activeTab="vouchers">
        <Suspense fallback={<PageSpinner label="Memuat detail voucher..." />}>
          <VoucherDetailRoute />
        </Suspense>
      </DashboardLayout>
    </RequireRole>
  );
}

"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import InvoiceDetail from "@/components/invoices/InvoiceDetail";
import { PageSpinner } from "@/components/invoices/States";

function InvoiceDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <InvoiceDetail key={id} invoiceId={id} />;
}

export default function InvoiceDetailPage() {
  return (
    <RequireRole role="INTAKE">
      <DashboardLayout activeTab="invoices">
        <Suspense fallback={<PageSpinner label="Memuat detail request..." />}>
          <InvoiceDetailRoute />
        </Suspense>
      </DashboardLayout>
    </RequireRole>
  );
}

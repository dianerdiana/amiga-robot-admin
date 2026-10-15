"use client";

import { Suspense } from "react";
import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import InvoiceQueue from "@/components/invoices/InvoiceQueue";
import { PageSpinner } from "@/components/invoices/States";

export default function InvoicesPage() {
  return (
    <RequireRole role="INTAKE">
      <DashboardLayout activeTab="invoices">
        <div className="mx-auto w-full max-w-[1366px]">
          <Suspense fallback={<PageSpinner label="Memuat antrean..." />}>
            <InvoiceQueue />
          </Suspense>
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}

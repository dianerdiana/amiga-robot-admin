"use client";

import { Suspense } from "react";
import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import InvoiceQueue from "@/components/invoices/InvoiceQueue";
import { PageSpinner } from "@/components/invoices/States";

export default function ReviewsPage() {
  return (
    <RequireRole role="FINANCE_REVIEWER">
      <DashboardLayout activeTab="reviews">
        <div className="mx-auto w-full max-w-[1366px]">
          <Suspense fallback={<PageSpinner label="Memuat antrean..." />}>
            <InvoiceQueue mode="reviewer" />
          </Suspense>
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}

"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageSpinner } from "@/components/invoices/States";
import ReviewWorkspace from "@/components/reviews/ReviewWorkspace";

function ReviewRoute() {
  const { id } = useParams<{ id: string }>();
  return <ReviewWorkspace key={id} invoiceId={id} />;
}

export default function ReviewDetailPage() {
  return (
    <RequireRole role="FINANCE_REVIEWER">
      <DashboardLayout activeTab="reviews">
        <Suspense fallback={<PageSpinner label="Memuat dokumen review..." />}>
          <ReviewRoute />
        </Suspense>
      </DashboardLayout>
    </RequireRole>
  );
}

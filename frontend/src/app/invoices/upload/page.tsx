"use client";

import { Suspense } from "react";
import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import InvoiceUploadForm from "@/components/invoices/InvoiceUploadForm";
import { PageSpinner } from "@/components/invoices/States";

export default function InvoiceUploadPage() {
  return (
    <RequireRole role="INTAKE">
      <DashboardLayout activeTab="upload">
        <Suspense fallback={<PageSpinner label="Memuat form upload..." />}>
          <InvoiceUploadForm />
        </Suspense>
      </DashboardLayout>
    </RequireRole>
  );
}

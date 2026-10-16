import RequireRole from "@/components/auth/RequireRole";
import ClientManagement from "@/components/clients/ClientManagement";
import DashboardLayout from "@/components/layout/DashboardLayout";

export const instant = false;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const query = await searchParams;
  const parsedPage = Number(first(query.page));
  const parsedPageSize = Number(first(query.page_size));
  const status = first(query.status);
  const reviewer = first(query.reviewer);
  const intake = first(query.intake);

  return (
    <RequireRole role="SYSTEM_ADMIN">
      <DashboardLayout activeTab="klien">
        <div className="mx-auto w-full max-w-[1366px]">
          <ClientManagement
            initialPage={Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1}
            initialPageSize={[10, 25, 50].includes(parsedPageSize) ? parsedPageSize : 10}
            initialSearch={first(query.search) ?? ""}
            initialStatus={status === "true" || status === "false" ? status : ""}
            initialReviewer={reviewer === "assigned" || reviewer === "unassigned" ? reviewer : ""}
            initialIntake={intake === "none" || intake === "single" || intake === "complete" ? intake : ""}
          />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}

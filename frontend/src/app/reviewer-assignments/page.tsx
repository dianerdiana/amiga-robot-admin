import RequireRole from "@/components/auth/RequireRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ReviewerAssignmentManagement from "@/components/reviewer-assignments/ReviewerAssignmentManagement";

export const instant = false;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ReviewerAssignmentsPage({ searchParams }: PageProps<"/reviewer-assignments">) {
  const query = await searchParams;
  const parsedPage = Number(first(query.page));
  const parsedPageSize = Number(first(query.page_size));
  const status = first(query.status);

  return (
    <RequireRole role="SERVICE_LEAD">
      <DashboardLayout activeTab="penugasan-reviewer">
        <div className="mx-auto w-full max-w-[1366px]">
          <ReviewerAssignmentManagement
            initialPage={Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1}
            initialPageSize={[10, 25, 50].includes(parsedPageSize) ? parsedPageSize : 10}
            initialSearch={first(query.search) ?? ""}
            initialStatus={status === "ASSIGNED" || status === "UNASSIGNED" ? status : ""}
          />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}

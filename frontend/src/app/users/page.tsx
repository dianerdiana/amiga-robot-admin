import DashboardLayout from "@/components/layout/DashboardLayout";
import RequireRole from "@/components/auth/RequireRole";
import UserManagement from "@/components/users/UserManagement";
import { ManageableUserRole } from "@/lib/api";

export const instant = false;

const roles: ManageableUserRole[] = ["INTAKE", "FINANCE_REVIEWER", "SERVICE_LEAD", "SYSTEM_ADMIN"];
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const query = await searchParams;
  const parsedPage = Number(first(query.page));
  const parsedPageSize = Number(first(query.page_size));
  const role = first(query.role);
  const status = first(query.status);

  return (
    <RequireRole role="SYSTEM_ADMIN">
      <DashboardLayout activeTab="pengguna">
        <div className="mx-auto w-full max-w-[1366px]">
          <UserManagement
            initialPage={Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1}
            initialPageSize={[10, 25, 50].includes(parsedPageSize) ? parsedPageSize : 10}
            initialSearch={first(query.search) ?? ""}
            initialRole={roles.includes(role as ManageableUserRole) ? role as ManageableUserRole : ""}
            initialStatus={status === "true" || status === "false" ? status : ""}
          />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}


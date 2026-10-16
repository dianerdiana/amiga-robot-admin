/** Landing page per role after login or when access is denied. */
export function homeForRole(role: string | undefined | null): string {
  switch (role) {
    case "SYSTEM_ADMIN":
      return "/users";
    case "INTAKE":
      return "/invoices";
    case "FINANCE_REVIEWER":
      return "/reviews";
    case "SERVICE_LEAD":
      return "/reviewer-assignments";
    default:
      return "/dashboard";
  }
}

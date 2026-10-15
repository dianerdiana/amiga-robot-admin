import { ManageableUserRole } from "@/lib/api";

export type UserFormState = {
  name: string;
  email: string;
  password: string;
  role: ManageableUserRole;
};

export const USER_ROLES: ManageableUserRole[] = [
  "INTAKE",
  "FINANCE_REVIEWER",
  "SERVICE_LEAD",
  "SYSTEM_ADMIN",
];

export const EMPTY_USER_FORM: UserFormState = {
  name: "",
  email: "",
  password: "",
  role: "INTAKE",
};


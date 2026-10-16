/** System Admin user management (ADM-01). */

import { apiFetch, withQuery } from "./client";

export type ManageableUserRole =
  | "INTAKE"
  | "FINANCE_REVIEWER"
  | "SERVICE_LEAD"
  | "SYSTEM_ADMIN";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: ManageableUserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: ManageableUserRole;
  is_active?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  password?: string;
  role?: ManageableUserRole;
  is_active?: boolean;
}

export const userService = {
  list(skip = 0, limit = 100): Promise<ManagedUser[]> {
    return apiFetch<ManagedUser[]>(withQuery("/api/v1/users", { skip, limit }));
  },

  create(payload: CreateUserPayload): Promise<ManagedUser> {
    return apiFetch<ManagedUser>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(userId: string, payload: UpdateUserPayload): Promise<ManagedUser> {
    return apiFetch<ManagedUser>(`/api/v1/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deactivate(userId: string): Promise<ManagedUser> {
    return apiFetch<ManagedUser>(`/api/v1/users/${userId}`, {
      method: "DELETE",
    });
  },
};

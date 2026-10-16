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
  assigned_clients: UserClientSummary[];
  created_at: string;
  updated_at: string;
}

export interface UserClientSummary {
  id: string;
  code: string;
  name: string;
}

export interface UserListResponse {
  items: ManagedUser[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  active_count: number;
  inactive_count: number;
}

export interface UserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: ManageableUserRole | "";
  isActive?: boolean;
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
  list(params: UserListParams = {}): Promise<UserListResponse> {
    return apiFetch<UserListResponse>(withQuery("/api/v1/users", {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 10,
      search: params.search,
      role: params.role,
      is_active: params.isActive,
    }));
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

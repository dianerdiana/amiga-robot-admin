/** System Admin client management and user-client assignments (ADM-01, ADM-02). */

import { apiFetch, withQuery } from "./client";
import type { ManagedUser } from "./users";

export interface ClientRecord {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManagedClient extends ClientRecord {
  active_reviewers: ClientAssignedUser[];
  assigned_intake: ClientAssignedUser[];
}

export interface ClientAssignedUser {
  id: string;
  name: string;
  email: string;
}

export interface ClientListResponse {
  items: ManagedClient[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  active_count: number;
  inactive_count: number;
  clients_with_reviewer: number;
  clients_without_reviewer: number;
  active_intake_staff: number;
}

export interface ClientListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  reviewerStatus?: "assigned" | "unassigned" | "";
  intakeStatus?: "none" | "single" | "complete" | "";
}

export interface CreateClientPayload {
  code: string;
  name: string;
  is_active?: boolean;
}

export interface UpdateClientPayload {
  code?: string;
  name?: string;
  is_active?: boolean;
}

export interface ClientAssignmentList {
  client_id: string;
  users: ManagedUser[];
}

export interface ReviewerOption {
  id: string;
  name: string;
  email: string;
}

export interface ReviewerAssignmentClient {
  client_id: string;
  client_code: string;
  client_name: string;
  client_is_active: boolean;
  active_reviewers: ReviewerOption[];
  assignment_status: "ASSIGNED" | "UNASSIGNED";
}

export interface ReviewerAssignmentListResponse {
  items: ReviewerAssignmentClient[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  assigned_count: number;
  unassigned_count: number;
}

export const clientService = {
  list(params: ClientListParams = {}): Promise<ClientListResponse> {
    return apiFetch<ClientListResponse>(withQuery("/api/v1/clients", {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 10,
      search: params.search,
      is_active: params.isActive,
      reviewer_status: params.reviewerStatus,
      intake_status: params.intakeStatus,
    }));
  },

  create(payload: CreateClientPayload): Promise<ClientRecord> {
    return apiFetch<ClientRecord>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(clientId: string, payload: UpdateClientPayload): Promise<ClientRecord> {
    return apiFetch<ClientRecord>(`/api/v1/clients/${clientId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deactivate(clientId: string): Promise<ClientRecord> {
    return apiFetch<ClientRecord>(`/api/v1/clients/${clientId}`, {
      method: "DELETE",
    });
  },

  listAssignments(clientId: string): Promise<ClientAssignmentList> {
    return apiFetch<ClientAssignmentList>(`/api/v1/clients/${clientId}/assignments`);
  },

  assignUser(clientId: string, userId: string): Promise<{ user_id: string; client_id: string }> {
    return apiFetch(`/api/v1/clients/${clientId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },

  revokeUser(clientId: string, userId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/clients/${clientId}/assignments/${userId}`, {
      method: "DELETE",
    });
  },

  listReviewerAssignments(params: { page?: number; pageSize?: number; search?: string; status?: "ASSIGNED" | "UNASSIGNED" | "" } = {}): Promise<ReviewerAssignmentListResponse> {
    return apiFetch<ReviewerAssignmentListResponse>(withQuery("/api/v1/clients/reviewer-assignments", {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 10,
      search: params.search,
      assignment_status: params.status,
    }));
  },

  listReviewerOptions(): Promise<ReviewerOption[]> {
    return apiFetch<ReviewerOption[]>("/api/v1/clients/reviewer-options");
  },

  assignReviewer(clientId: string, reviewerId: string): Promise<{ user_id: string; client_id: string }> {
    return apiFetch(`/api/v1/clients/${clientId}/reviewers`, {
      method: "POST",
      body: JSON.stringify({ reviewer_id: reviewerId }),
    });
  },

  revokeReviewer(clientId: string, reviewerId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/clients/${clientId}/assignments/${reviewerId}`, {
      method: "DELETE",
    });
  },
};

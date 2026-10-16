/** System Admin client management and user-client assignments (ADM-01, ADM-02). */

import { apiFetch, withQuery } from "./client";
import type { ManagedUser } from "./users";

export interface ManagedClient {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

export const clientService = {
  list(skip = 0, limit = 100): Promise<ManagedClient[]> {
    return apiFetch<ManagedClient[]>(withQuery("/api/v1/clients", { skip, limit }));
  },

  create(payload: CreateClientPayload): Promise<ManagedClient> {
    return apiFetch<ManagedClient>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(clientId: string, payload: UpdateClientPayload): Promise<ManagedClient> {
    return apiFetch<ManagedClient>(`/api/v1/clients/${clientId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deactivate(clientId: string): Promise<ManagedClient> {
    return apiFetch<ManagedClient>(`/api/v1/clients/${clientId}`, {
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
};

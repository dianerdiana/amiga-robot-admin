"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ManagedUser, ManageableUserRole, userService } from "@/lib/api";
import UserFilters from "./UserFilters";
import UserFormModal from "./UserFormModal";
import UserStatusModal from "./UserStatusModal";
import UserSummary from "./UserSummary";
import UserTable from "./UserTable";
import { EMPTY_USER_FORM, UserFormState } from "./types";

type Modal = "add" | "edit" | "status" | null;
type Props = {
  initialPage: number;
  initialPageSize: number;
  initialSearch: string;
  initialRole: ManageableUserRole | "";
  initialStatus: "true" | "false" | "";
};

export default function UserManagement({ initialPage, initialPageSize, initialSearch, initialRole, initialStatus }: Props) {
  const router = useRouter();
  const requestId = useRef(0);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [roleFilter, setRoleFilter] = useState<ManageableUserRole | "">(initialRole);
  const [statusFilter, setStatusFilter] = useState<"true" | "false" | "">(initialStatus);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadUsers = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await userService.list({
        page,
        pageSize,
        search: search.trim(),
        role: roleFilter,
        isActive: statusFilter ? statusFilter === "true" : undefined,
      });
      if (currentRequest !== requestId.current) return;
      setUsers(result.items);
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setActiveCount(result.active_count);
      setInactiveCount(result.inactive_count);
      if (result.total_pages > 0 && page > result.total_pages) setPage(result.total_pages);
    } catch (err) {
      if (currentRequest === requestId.current) setError(err instanceof Error ? err.message : "Gagal memuat pengguna.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, pageSize, roleFilter, search, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadUsers(), 300);
    return () => window.clearTimeout(timeout);
  }, [loadUsers]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("page_size", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    const query = params.toString();
    const nextUrl = query ? `/users?${query}` : "/users";
    const timeout = window.setTimeout(() => {
      if (`${window.location.pathname}${window.location.search}` !== nextUrl) router.replace(nextUrl, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [page, pageSize, roleFilter, router, search, statusFilter]);

  useEffect(() => {
    setPage(initialPage);
    setPageSize(initialPageSize);
    setSearch(initialSearch);
    setRoleFilter(initialRole);
    setStatusFilter(initialStatus);
  }, [initialPage, initialPageSize, initialRole, initialSearch, initialStatus]);

  useEffect(() => {
    if (!modal) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && !submitting && setModal(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [modal, submitting]);

  const openAdd = () => { setSelectedUser(null); setForm(EMPTY_USER_FORM); setError(null); setModal("add"); };
  const openEdit = (user: ManagedUser) => { setSelectedUser(user); setForm({ name: user.name, email: user.email, password: "", role: user.role }); setError(null); setModal("edit"); };
  const openStatus = (user: ManagedUser) => { setSelectedUser(user); setError(null); setModal("status"); };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      if (modal === "add") {
        await userService.create({ ...form, is_active: true });
        setPage(1);
        notify("Pengguna baru berhasil ditambahkan.");
      } else if (modal === "edit" && selectedUser) {
        await userService.update(selectedUser.id, { name: form.name, email: form.email, role: form.role, ...(form.password ? { password: form.password } : {}) });
        notify("Data pengguna berhasil diperbarui.");
      }
      setModal(null);
      await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "Operasi pengguna gagal."); }
    finally { setSubmitting(false); }
  };

  const changeStatus = async () => {
    if (!selectedUser) return;
    setSubmitting(true); setError(null);
    try {
      const updated = selectedUser.is_active ? await userService.deactivate(selectedUser.id) : await userService.update(selectedUser.id, { is_active: true });
      setModal(null);
      notify(updated.is_active ? "Akses pengguna berhasil diaktifkan kembali." : "Akses pengguna berhasil dinonaktifkan.");
      await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "Perubahan status gagal."); }
    finally { setSubmitting(false); }
  };

  const resetFilters = () => { setSearch(""); setRoleFilter(""); setStatusFilter(""); setPage(1); };

  return (
    <div className="flex w-full flex-col pb-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><span>Konsol System Admin</span><span className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span><span className="font-semibold text-text-primary">Pengguna</span></nav>
      <div className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="flex max-w-2xl items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary"><span className="material-symbols-outlined text-[25px]">manage_accounts</span></div><div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Manajemen Pengguna</h1><p className="mt-1 text-xs leading-relaxed text-text-secondary sm:text-sm">Kelola akun internal, peran tunggal, penugasan klien, dan status akses pengguna AMIGA Robot Admin.</p></div></div>
        <UserSummary total={activeCount + inactiveCount} active={activeCount} />
      </div>
      {error && !modal && <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg"><div className="flex gap-3"><span className="material-symbols-outlined">error</span><div><p className="font-semibold">Data pengguna tidak dapat diproses</p><p className="text-xs">{error}</p></div></div><button type="button" onClick={() => void loadUsers()} className="rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">Coba lagi</button></div>}
      <UserFilters search={search} role={roleFilter} status={statusFilter} onSearchChange={(value) => { setSearch(value); setPage(1); }} onRoleChange={(value) => { setRoleFilter(value as ManageableUserRole | ""); setPage(1); }} onStatusChange={(value) => { setStatusFilter(value as "true" | "false" | ""); setPage(1); }} onReset={resetFilters} onAdd={openAdd} />
      <UserTable users={users} total={total} page={page} pageSize={pageSize} totalPages={totalPages} loading={loading} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} onEdit={openEdit} onStatus={openStatus} onCopy={(email) => { void navigator.clipboard.writeText(email); notify("Email berhasil disalin."); }} />
      {(modal === "add" || modal === "edit") && <UserFormModal mode={modal} userName={selectedUser?.name} form={form} error={error} submitting={submitting} onChange={setForm} onClose={() => setModal(null)} onSubmit={submitForm} />}
      {modal === "status" && selectedUser && <UserStatusModal user={selectedUser} error={error} submitting={submitting} onClose={() => setModal(null)} onConfirm={() => void changeStatus()} />}
      {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg"><span className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>{toast}</div>}
    </div>
  );
}

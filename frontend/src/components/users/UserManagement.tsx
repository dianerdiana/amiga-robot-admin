"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ManagedUser, userService } from "@/lib/api";
import UserFilters from "./UserFilters";
import UserFormModal from "./UserFormModal";
import UserStatusModal from "./UserStatusModal";
import UserSummary from "./UserSummary";
import UserTable from "./UserTable";
import { EMPTY_USER_FORM, UserFormState } from "./types";

type Modal = "add" | "edit" | "status" | null;

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };
  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await userService.list()); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal memuat pengguna."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);
  useEffect(() => {
    if (!modal) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && !submitting && setModal(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [modal, submitting]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((user) => {
      const code = `USR-${user.id.replaceAll("-", "").slice(0, 6)}`.toLowerCase();
      return (!keyword || user.name.toLowerCase().includes(keyword) || user.email.toLowerCase().includes(keyword) || code.includes(keyword))
        && (!roleFilter || user.role === roleFilter)
        && (!statusFilter || String(user.is_active) === statusFilter);
    });
  }, [roleFilter, search, statusFilter, users]);

  const activeCount = useMemo(() => users.filter((user) => user.is_active).length, [users]);
  const openAdd = () => { setSelectedUser(null); setForm(EMPTY_USER_FORM); setError(null); setModal("add"); };
  const openEdit = (user: ManagedUser) => { setSelectedUser(user); setForm({ name: user.name, email: user.email, password: "", role: user.role }); setError(null); setModal("edit"); };
  const openStatus = (user: ManagedUser) => { setSelectedUser(user); setError(null); setModal("status"); };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      if (modal === "add") {
        const created = await userService.create({ ...form, is_active: true });
        setUsers((current) => [created, ...current]); notify("Pengguna baru berhasil ditambahkan.");
      } else if (modal === "edit" && selectedUser) {
        const updated = await userService.update(selectedUser.id, { name: form.name, email: form.email, role: form.role, ...(form.password ? { password: form.password } : {}) });
        setUsers((current) => current.map((user) => user.id === updated.id ? updated : user)); notify("Data pengguna berhasil diperbarui.");
      }
      setModal(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Operasi pengguna gagal."); }
    finally { setSubmitting(false); }
  };

  const changeStatus = async () => {
    if (!selectedUser) return;
    setSubmitting(true); setError(null);
    try {
      const updated = selectedUser.is_active ? await userService.deactivate(selectedUser.id) : await userService.update(selectedUser.id, { is_active: true });
      setUsers((current) => current.map((user) => user.id === updated.id ? updated : user));
      setModal(null); notify(updated.is_active ? "Akses pengguna berhasil diaktifkan kembali." : "Akses pengguna berhasil dinonaktifkan.");
    } catch (err) { setError(err instanceof Error ? err.message : "Perubahan status gagal."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="flex w-full flex-col pb-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><span>Konsol System Admin</span><span className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span><span className="font-semibold text-text-primary">Pengguna</span></nav>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex max-w-2xl items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><span className="material-symbols-outlined text-[24px]">manage_accounts</span></div><div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Manajemen Pengguna</h1><p className="mt-0.5 text-xs text-text-secondary sm:text-sm">Kelola akun internal, peran tunggal, dan status akses pengguna AMIGA Robot Admin.</p></div></div>
        <UserSummary total={users.length} active={activeCount} />
      </div>
      {error && !modal && <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg"><div className="flex gap-3"><span className="material-symbols-outlined">error</span><div><p className="font-semibold">Data pengguna tidak dapat diproses</p><p className="text-xs">{error}</p></div></div><button type="button" onClick={() => void loadUsers()} className="rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">Coba lagi</button></div>}
      <UserFilters search={search} role={roleFilter} status={statusFilter} onSearchChange={setSearch} onRoleChange={setRoleFilter} onStatusChange={setStatusFilter} onReset={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); }} onAdd={openAdd} />
      <UserTable users={filteredUsers} total={users.length} loading={loading} onEdit={openEdit} onStatus={openStatus} onCopy={(email) => { void navigator.clipboard.writeText(email); notify("Email berhasil disalin."); }} />
      {(modal === "add" || modal === "edit") && <UserFormModal mode={modal} userName={selectedUser?.name} form={form} error={error} submitting={submitting} onChange={setForm} onClose={() => setModal(null)} onSubmit={submitForm} />}
      {modal === "status" && selectedUser && <UserStatusModal user={selectedUser} error={error} submitting={submitting} onClose={() => setModal(null)} onConfirm={() => void changeStatus()} />}
      {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg"><span className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>{toast}</div>}
    </div>
  );
}


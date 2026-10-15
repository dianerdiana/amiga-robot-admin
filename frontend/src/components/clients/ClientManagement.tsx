"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { clientService, ManagedClient, ManagedUser, userService } from "@/lib/api";

type Modal = "add" | "edit" | "status" | "assign" | "view" | null;
type FormState = { code: string; name: string };
const EMPTY_FORM: FormState = { code: "", name: "" };

export default function ClientManagement() {
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedClient, setSelectedClient] = useState<ManagedClient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [assignedUsers, setAssignedUsers] = useState<ManagedUser[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };
  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setClients(await clientService.list()); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal memuat data klien."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);
  useEffect(() => {
    if (!modal) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && !submitting && setModal(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [modal, submitting]);

  const filteredClients = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return clients.filter((client) =>
      (!keyword || client.name.toLowerCase().includes(keyword) || client.code.toLowerCase().includes(keyword)) &&
      (!status || String(client.is_active) === status)
    );
  }, [clients, search, status]);
  const activeCount = useMemo(() => clients.filter((client) => client.is_active).length, [clients]);
  const openAdd = () => { setSelectedClient(null); setForm(EMPTY_FORM); setError(null); setModal("add"); };
  const openEdit = (client: ManagedClient) => { setSelectedClient(client); setForm({ code: client.code, name: client.name }); setError(null); setModal("edit"); };
  const openStatus = (client: ManagedClient) => { setSelectedClient(client); setError(null); setModal("status"); };
  const openAssignments = async (client: ManagedClient, mode: "assign" | "view") => {
    setSelectedClient(client); setError(null); setSubmitting(true); setModal(mode);
    try {
      const assignments = await clientService.listAssignments(client.id);
      setAssignedUsers(assignments.users);
      if (mode === "assign") {
        const users = await userService.list();
        setAssignableUsers(users.filter((user) => user.role === "INTAKE" && user.is_active && !assignments.users.some((assigned) => assigned.id === user.id)));
        setSelectedUserId("");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal memuat penugasan klien."); }
    finally { setSubmitting(false); }
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      if (modal === "add") {
        const created = await clientService.create({ ...form, is_active: true });
        setClients((current) => [created, ...current]);
        notify("Klien baru berhasil ditambahkan.");
      } else if (modal === "edit" && selectedClient) {
        const updated = await clientService.update(selectedClient.id, form);
        setClients((current) => current.map((client) => client.id === updated.id ? updated : client));
        notify("Data klien berhasil diperbarui.");
      }
      setModal(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Operasi klien gagal."); }
    finally { setSubmitting(false); }
  };
  const changeStatus = async () => {
    if (!selectedClient) return;
    setSubmitting(true); setError(null);
    try {
      const updated = selectedClient.is_active
        ? await clientService.deactivate(selectedClient.id)
        : await clientService.update(selectedClient.id, { is_active: true });
      setClients((current) => current.map((client) => client.id === updated.id ? updated : client));
      setModal(null);
      notify(updated.is_active ? "Klien berhasil diaktifkan kembali." : "Klien berhasil dinonaktifkan.");
    } catch (err) { setError(err instanceof Error ? err.message : "Perubahan status gagal."); }
    finally { setSubmitting(false); }
  };
  const assignUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClient || !selectedUserId) return;
    setSubmitting(true); setError(null);
    try {
      await clientService.assignUser(selectedClient.id, selectedUserId);
      setModal(null);
      notify("User Intake berhasil ditugaskan ke klien.");
    } catch (err) { setError(err instanceof Error ? err.message : "Penugasan user gagal."); }
    finally { setSubmitting(false); }
  };
  const revokeUser = async (user: ManagedUser) => {
    if (!selectedClient || !window.confirm(`Cabut penugasan ${user.name} dari ${selectedClient.name}?`)) return;
    setRevokingUserId(user.id); setError(null);
    try {
      await clientService.revokeUser(selectedClient.id, user.id);
      setAssignedUsers((current) => current.filter((assigned) => assigned.id !== user.id));
      notify("Penugasan user berhasil dicabut.");
    } catch (err) { setError(err instanceof Error ? err.message : "Pencabutan penugasan gagal."); }
    finally { setRevokingUserId(null); }
  };

  return (
    <div className="flex w-full flex-col pb-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><span>Konsol System Admin</span><span className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span><span className="font-semibold text-text-primary">Klien</span></nav>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex max-w-2xl items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><span className="material-symbols-outlined text-[24px]">apartment</span></div><div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Manajemen Klien</h1><p className="mt-0.5 text-xs text-text-secondary sm:text-sm">Kelola master data perusahaan klien dan status ketersediaannya di AMIGA Robot Admin.</p></div></div><div className="grid shrink-0 grid-cols-3 gap-2 rounded-lg border border-border bg-surface p-1.5 text-center shadow-sm">{[["Total Klien", clients.length, "text-text-primary"], ["Aktif", activeCount, "text-success"], ["Nonaktif", clients.length - activeCount, "text-text-secondary"]].map(([label, value, color]) => <div key={String(label)} className="px-3 py-1.5 sm:px-4"><span className={`block text-[11px] ${color}`}>{label}</span><span className={`font-mono text-lg font-bold ${color}`}>{value}</span></div>)}</div></div>
      {error && !modal && <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg"><div className="flex gap-3"><span className="material-symbols-outlined">error</span><div><p className="font-semibold">Data klien tidak dapat diproses</p><p className="text-xs">{error}</p></div></div><button type="button" onClick={() => void loadClients()} className="rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">Coba lagi</button></div>}
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex flex-1 flex-wrap items-center gap-2.5"><label className="relative min-w-[220px] flex-1 md:max-w-xs"><span className="sr-only">Cari klien</span><span className="material-symbols-outlined pointer-events-none absolute left-3 top-2.5 text-[18px] text-text-disabled">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau kode klien..." className="h-9 w-full rounded border border-border bg-white pl-9 pr-3 text-xs focus:ring-2 focus:ring-focus-ring" /></label><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded border border-border bg-white px-2.5 text-xs focus:ring-2 focus:ring-focus-ring"><option value="">Semua Status</option><option value="true">Aktif</option><option value="false">Nonaktif</option></select>{(search || status) && <button type="button" onClick={() => { setSearch(""); setStatus(""); }} className="flex h-9 items-center gap-1 rounded px-2.5 text-xs text-text-secondary hover:bg-surface-muted"><span className="material-symbols-outlined text-[16px]">restart_alt</span>Reset</button>}</div><button type="button" onClick={openAdd} className="flex h-9 shrink-0 items-center justify-center gap-2 rounded bg-primary px-4 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover"><span className="material-symbols-outlined text-[18px]">add_business</span>Tambah Klien</button></div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"><div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="h-10 border-b border-border bg-surface-muted">{["Kode Klien", "Nama Perusahaan", "Status", "Dibuat", "Aksi"].map((heading) => <th key={heading} className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary ${heading === "Aksi" ? "text-right" : ""}`}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-surface-muted text-xs">{loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="h-14 animate-pulse"><td colSpan={5} className="px-4"><div className="h-7 rounded bg-surface-muted" /></td></tr>) : filteredClients.length === 0 ? <tr><td colSpan={5} className="px-4 py-14 text-center text-text-disabled"><span className="material-symbols-outlined mb-2 block text-[36px]">domain_disabled</span>{clients.length ? "Tidak ada klien yang cocok dengan filter." : "Belum ada klien."}</td></tr> : filteredClients.map((client) => <tr key={client.id} className={`h-14 transition-colors hover:bg-background ${client.is_active ? "" : "opacity-75"}`}><td className="px-4 py-2 font-mono font-semibold text-primary">{client.code}</td><td className="px-4 py-2 font-semibold text-text-primary">{client.name}</td><td className="px-4 py-2"><span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${client.is_active ? "border-status-reviewed-border bg-success-subtle text-success" : "border-border bg-surface-muted text-text-secondary"}`}><span className="material-symbols-outlined mr-1 text-[13px]">{client.is_active ? "check_circle" : "cancel"}</span>{client.is_active ? "Aktif" : "Nonaktif"}</span></td><td className="px-4 py-2 text-text-secondary">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(client.created_at))}</td><td className="px-4 py-2 text-right"><div className="flex justify-end gap-1"><button type="button" title="Lihat user yang ditugaskan" onClick={() => void openAssignments(client, "view")} className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-primary"><span className="material-symbols-outlined text-[18px]">visibility</span></button><button type="button" title="Tugaskan user Intake" disabled={!client.is_active} onClick={() => void openAssignments(client, "assign")} className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">person_add</span></button><button type="button" title="Edit klien" onClick={() => openEdit(client)} className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-primary"><span className="material-symbols-outlined text-[18px]">edit</span></button><button type="button" title={client.is_active ? "Nonaktifkan klien" : "Aktifkan klien"} onClick={() => openStatus(client)} className={`rounded p-1 ${client.is_active ? "text-danger hover:bg-danger-subtle" : "text-success hover:bg-success-subtle"}`}><span className="material-symbols-outlined text-[18px]">{client.is_active ? "block" : "check_circle"}</span></button></div></td></tr>)}</tbody></table></div>{!loading && <div className="border-t border-border bg-surface-muted px-4 py-3 text-xs text-text-secondary">Menampilkan <strong>{filteredClients.length}</strong> dari <strong>{clients.length}</strong> klien</div>}</div>
      {(modal === "add" || modal === "edit") && <ClientFormModal mode={modal} clientName={selectedClient?.name} form={form} error={error} submitting={submitting} onChange={setForm} onClose={() => setModal(null)} onSubmit={submitForm} />}
      {modal === "status" && selectedClient && <ClientStatusModal client={selectedClient} error={error} submitting={submitting} onClose={() => setModal(null)} onConfirm={() => void changeStatus()} />}
      {modal === "assign" && selectedClient && <ClientAssignModal client={selectedClient} users={assignableUsers} selectedUserId={selectedUserId} error={error} loading={submitting} onChange={setSelectedUserId} onClose={() => setModal(null)} onSubmit={assignUser} />}
      {modal === "view" && selectedClient && <ClientUsersModal client={selectedClient} users={assignedUsers} error={error} loading={submitting} revokingUserId={revokingUserId} onRevoke={(user) => void revokeUser(user)} onClose={() => setModal(null)} />}
      {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg"><span className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>{toast}</div>}
    </div>
  );
}

function ClientFormModal({ mode, clientName, form, error, submitting, onChange, onClose, onSubmit }: { mode: "add" | "edit"; clientName?: string; form: FormState; error: string | null; submitting: boolean; onChange: (form: FormState) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="client-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-lg"><div className="flex items-start justify-between border-b border-border px-6 py-4"><div><h2 id="client-form-title" className="text-base font-semibold">{mode === "add" ? "Tambah Klien Baru" : "Edit Klien"}</h2><p className="mt-1 text-xs text-text-secondary">{mode === "add" ? "Tambahkan master data perusahaan klien." : `Perbarui data ${clientName}.`}</p></div><button type="button" aria-label="Tutup" disabled={submitting} onClick={onClose} className="text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined">close</span></button></div><form onSubmit={onSubmit} className="space-y-4 p-6">{error && <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}<label className="block text-xs font-semibold">Kode Klien<input required maxLength={50} value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase() })} className="mt-1 h-10 w-full rounded border border-border-strong px-3 font-mono font-normal focus:ring-2 focus:ring-focus-ring" placeholder="Contoh: CL-001" /></label><label className="block text-xs font-semibold">Nama Perusahaan<input required maxLength={255} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} className="mt-1 h-10 w-full rounded border border-border-strong px-3 font-normal focus:ring-2 focus:ring-focus-ring" placeholder="Contoh: PT AMIGA Indonesia" /></label><div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted">Batal</button><button type="submit" disabled={submitting} className="h-10 rounded bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{submitting ? "Menyimpan..." : mode === "add" ? "Simpan Klien" : "Perbarui Klien"}</button></div></form></div></div>;
}

function ClientStatusModal({ client, error, submitting, onClose, onConfirm }: { client: ManagedClient; error: string | null; submitting: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="client-status-title" className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-white shadow-lg"><div className="p-6"><div className="mb-4 flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-full ${client.is_active ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}><span className="material-symbols-outlined">{client.is_active ? "domain_disabled" : "domain_add"}</span></div><h2 id="client-status-title" className="text-base font-semibold">{client.is_active ? "Nonaktifkan Klien?" : "Aktifkan Kembali Klien?"}</h2></div><p className="text-sm leading-relaxed text-text-secondary"><strong className="text-text-primary">{client.name}</strong> {client.is_active ? "tidak lagi tersedia untuk proses baru. Data dan histori klien tetap tersimpan." : "kembali tersedia untuk proses operasional baru."}</p>{error && <div role="alert" className="mt-4 rounded bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}</div><div className="flex justify-end gap-3 border-t border-border bg-surface-muted px-6 py-3"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded border border-border bg-white px-4 text-xs font-semibold">Batal</button><button type="button" disabled={submitting} onClick={onConfirm} className={`h-10 rounded px-4 text-xs font-semibold text-white disabled:opacity-60 ${client.is_active ? "bg-danger" : "bg-success"}`}>{submitting ? "Memproses..." : client.is_active ? "Nonaktifkan Klien" : "Aktifkan Klien"}</button></div></div></div>;
}

function ClientAssignModal({ client, users, selectedUserId, error, loading, onChange, onClose, onSubmit }: { client: ManagedClient; users: ManagedUser[]; selectedUserId: string; error: string | null; loading: boolean; onChange: (userId: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="assign-client-title" className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-lg"><div className="flex items-start justify-between border-b border-border px-6 py-4"><div><h2 id="assign-client-title" className="text-base font-semibold">Tugaskan User Intake</h2><p className="mt-1 text-xs text-text-secondary">Pilih user Intake aktif untuk <strong>{client.name}</strong>.</p></div><button type="button" aria-label="Tutup" disabled={loading} onClick={onClose} className="text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined">close</span></button></div><form onSubmit={onSubmit} className="space-y-4 p-6">{error && <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}<label className="block text-xs font-semibold">User Intake<select required disabled={loading || users.length === 0} value={selectedUserId} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded border border-border-strong bg-white px-3 font-normal focus:ring-2 focus:ring-focus-ring disabled:bg-surface-muted"><option value="">{loading ? "Memuat user..." : users.length ? "Pilih user Intake" : "Tidak ada user Intake yang dapat ditugaskan"}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></label><p className="text-xs text-text-secondary">User yang sudah ditugaskan tidak ditampilkan dalam pilihan.</p><div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" disabled={loading} onClick={onClose} className="h-10 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted">Batal</button><button type="submit" disabled={loading || !selectedUserId} className="h-10 rounded bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{loading ? "Memproses..." : "Tugaskan User"}</button></div></form></div></div>;
}

function ClientUsersModal({ client, users, error, loading, revokingUserId, onRevoke, onClose }: { client: ManagedClient; users: ManagedUser[]; error: string | null; loading: boolean; revokingUserId: string | null; onRevoke: (user: ManagedUser) => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="client-users-title" className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-lg"><div className="flex items-start justify-between border-b border-border px-6 py-4"><div><h2 id="client-users-title" className="text-base font-semibold">User pada Klien</h2><p className="mt-1 text-xs text-text-secondary">Daftar user yang ditugaskan ke <strong>{client.name}</strong>.</p></div><button type="button" onClick={onClose} className="text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined">close</span></button></div><div className="p-6">{loading ? <div className="space-y-3 animate-pulse">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 rounded bg-surface-muted" />)}</div> : error ? <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div> : users.length === 0 ? <div className="py-8 text-center text-sm text-text-disabled"><span className="material-symbols-outlined mb-2 block text-[36px]">group_off</span>Belum ada user yang ditugaskan.</div> : <ul className="divide-y divide-surface-muted rounded-lg border border-border">{users.map((user) => <li key={user.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-text-primary">{user.name}</p><p className="text-xs text-text-secondary">{user.email}</p></div><div className="flex items-center gap-2"><span className="rounded border border-status-vouchered-border bg-primary-subtle px-2 py-0.5 text-[11px] font-semibold text-primary">{user.role}</span><button type="button" title={`Cabut ${user.name} dari klien`} disabled={revokingUserId !== null} onClick={() => onRevoke(user)} className="rounded p-1 text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">person_remove</span></button></div></li>)}</ul>}</div><div className="flex justify-end border-t border-border bg-surface-muted px-6 py-3"><button type="button" onClick={onClose} className="h-10 rounded border border-border bg-white px-4 text-xs font-semibold">Tutup</button></div></div></div>;
}

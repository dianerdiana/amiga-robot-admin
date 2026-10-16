"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clientService, ManagedClient, ManagedUser, userService } from "@/lib/api";
import ClientFilters from "./ClientFilters";
import ClientSummary from "./ClientSummary";
import ClientTable from "./ClientTable";

type Modal = "add" | "edit" | "status" | "assign" | "view" | null;
type FormState = { code: string; name: string };
type ReviewerFilter = "assigned" | "unassigned" | "";
type IntakeFilter = "none" | "single" | "complete" | "";
type Props = { initialPage: number; initialPageSize: number; initialSearch: string; initialStatus: "true" | "false" | ""; initialReviewer: ReviewerFilter; initialIntake: IntakeFilter };
const EMPTY_FORM: FormState = { code: "", name: "" };

export default function ClientManagement({ initialPage, initialPageSize, initialSearch, initialStatus, initialReviewer, initialIntake }: Props) {
  const router = useRouter();
  const requestId = useRef(0);
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<"true" | "false" | "">(initialStatus);
  const [reviewer, setReviewer] = useState<ReviewerFilter>(initialReviewer);
  const [intake, setIntake] = useState<IntakeFilter>(initialIntake);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stats, setStats] = useState({ active: 0, inactive: 0, withReviewer: 0, withoutReviewer: 0, activeIntake: 0 });
  const [modal, setModal] = useState<Modal>(null);
  const [selectedClient, setSelectedClient] = useState<ManagedClient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [assignedUsers, setAssignedUsers] = useState<ManagedUser[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3500); };
  const loadClients = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const result = await clientService.list({ page, pageSize, search: search.trim(), isActive: status ? status === "true" : undefined, reviewerStatus: reviewer, intakeStatus: intake });
      if (currentRequest !== requestId.current) return;
      setClients(result.items); setTotal(result.total); setTotalPages(result.total_pages);
      setStats({ active: result.active_count, inactive: result.inactive_count, withReviewer: result.clients_with_reviewer, withoutReviewer: result.clients_without_reviewer, activeIntake: result.active_intake_staff });
      if (result.total_pages > 0 && page > result.total_pages) setPage(result.total_pages);
    } catch (err) { if (currentRequest === requestId.current) setError(err instanceof Error ? err.message : "Gagal memuat data klien."); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [intake, page, pageSize, reviewer, search, status]);

  useEffect(() => { const timeout = window.setTimeout(() => void loadClients(), 300); return () => window.clearTimeout(timeout); }, [loadClients]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("page_size", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (reviewer) params.set("reviewer", reviewer);
    if (intake) params.set("intake", intake);
    const query = params.toString(); const nextUrl = query ? `/clients?${query}` : "/clients";
    const timeout = window.setTimeout(() => { if (`${window.location.pathname}${window.location.search}` !== nextUrl) router.replace(nextUrl, { scroll: false }); }, 300);
    return () => window.clearTimeout(timeout);
  }, [intake, page, pageSize, reviewer, router, search, status]);
  useEffect(() => { setPage(initialPage); setPageSize(initialPageSize); setSearch(initialSearch); setStatus(initialStatus); setReviewer(initialReviewer); setIntake(initialIntake); }, [initialIntake, initialPage, initialPageSize, initialReviewer, initialSearch, initialStatus]);
  useEffect(() => { if (!modal) return; const close = (event: KeyboardEvent) => event.key === "Escape" && !submitting && setModal(null); document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [modal, submitting]);

  const openAdd = () => { setSelectedClient(null); setForm(EMPTY_FORM); setError(null); setModal("add"); };
  const openEdit = (client: ManagedClient) => { setSelectedClient(client); setForm({ code: client.code, name: client.name }); setError(null); setModal("edit"); };
  const openStatus = (client: ManagedClient) => { setSelectedClient(client); setError(null); setModal("status"); };
  const openAssignments = async (client: ManagedClient, mode: "assign" | "view") => {
    setSelectedClient(client); setError(null); setSubmitting(true); setModal(mode);
    try {
      const assignments = await clientService.listAssignments(client.id); setAssignedUsers(assignments.users);
      if (mode === "assign") {
        const { items } = await userService.list({ pageSize: 100, role: "INTAKE", isActive: true });
        setAssignableUsers(items.filter((user) => !assignments.users.some((assigned) => assigned.id === user.id))); setSelectedUserId("");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal memuat penugasan klien."); }
    finally { setSubmitting(false); }
  };
  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      if (modal === "add") { await clientService.create({ ...form, is_active: true }); setPage(1); notify("Klien baru berhasil ditambahkan."); }
      else if (modal === "edit" && selectedClient) { await clientService.update(selectedClient.id, form); notify("Data klien berhasil diperbarui."); }
      setModal(null); await loadClients();
    } catch (err) { setError(err instanceof Error ? err.message : "Operasi klien gagal."); }
    finally { setSubmitting(false); }
  };
  const changeStatus = async () => {
    if (!selectedClient) return; setSubmitting(true); setError(null);
    try { const updated = selectedClient.is_active ? await clientService.deactivate(selectedClient.id) : await clientService.update(selectedClient.id, { is_active: true }); setModal(null); notify(updated.is_active ? "Klien berhasil diaktifkan kembali." : "Klien berhasil dinonaktifkan."); await loadClients(); }
    catch (err) { setError(err instanceof Error ? err.message : "Perubahan status gagal."); }
    finally { setSubmitting(false); }
  };
  const assignUser = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedClient || !selectedUserId) return; setSubmitting(true); setError(null);
    try { await clientService.assignUser(selectedClient.id, selectedUserId); setModal(null); notify("Staf Intake berhasil ditugaskan ke klien."); await loadClients(); }
    catch (err) { setError(err instanceof Error ? err.message : "Penugasan user gagal."); }
    finally { setSubmitting(false); }
  };
  const revokeUser = async (user: ManagedUser) => {
    if (!selectedClient || user.role !== "INTAKE" || !window.confirm(`Cabut penugasan ${user.name} dari ${selectedClient.name}?`)) return;
    setRevokingUserId(user.id); setError(null);
    try { await clientService.revokeUser(selectedClient.id, user.id); setAssignedUsers((current) => current.filter((assigned) => assigned.id !== user.id)); notify("Penugasan Intake berhasil dicabut."); await loadClients(); }
    catch (err) { setError(err instanceof Error ? err.message : "Pencabutan penugasan gagal."); }
    finally { setRevokingUserId(null); }
  };
  const resetFilters = () => { setSearch(""); setStatus(""); setReviewer(""); setIntake(""); setPage(1); };

  return <div className="flex w-full flex-col pb-8">
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><span>Konsol System Admin</span><span className="material-symbols-outlined text-[14px]">chevron_right</span><span className="font-semibold text-text-primary">Master Klien & Penugasan</span></nav>
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div className="flex items-start gap-3.5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary shadow-sm"><span className="material-symbols-outlined text-[28px]">domain</span></div><div><div className="flex flex-wrap items-center gap-2.5"><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Master Klien & Penugasan Intake</h1><span className="rounded bg-accent-subtle px-2 py-0.5 text-[10px] font-semibold uppercase text-status-ready-fg">Master Role Admin</span></div><p className="mt-1 text-sm text-text-secondary">Kelola entitas klien, kode unik sistem, reviewer, dan alokasi staf Intake operasional.</p></div></div><button type="button" onClick={openAdd} className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-container px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover"><span className="material-symbols-outlined text-[20px]">add_business</span>Tambah Klien</button></header>
    <ClientSummary total={stats.active + stats.inactive} active={stats.active} withReviewer={stats.withReviewer} withoutReviewer={stats.withoutReviewer} activeIntake={stats.activeIntake} />
    {error && !modal && <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg"><div className="flex gap-3"><span className="material-symbols-outlined">error</span><div><p className="font-semibold">Data klien tidak dapat diproses</p><p className="text-xs">{error}</p></div></div><button type="button" onClick={() => void loadClients()} className="rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">Coba lagi</button></div>}
    <ClientFilters search={search} status={status} reviewer={reviewer} intake={intake} total={total} onSearchChange={(value) => { setSearch(value); setPage(1); }} onStatusChange={(value) => { setStatus(value as typeof status); setPage(1); }} onReviewerChange={(value) => { setReviewer(value as ReviewerFilter); setPage(1); }} onIntakeChange={(value) => { setIntake(value as IntakeFilter); setPage(1); }} onReset={resetFilters} />
    <ClientTable clients={clients} total={total} page={page} pageSize={pageSize} totalPages={totalPages} loading={loading} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} onAssign={(client) => void openAssignments(client, "assign")} onView={(client) => void openAssignments(client, "view")} onEdit={openEdit} onStatus={openStatus} />
    {(modal === "add" || modal === "edit") && <ClientFormModal mode={modal} clientName={selectedClient?.name} form={form} error={error} submitting={submitting} onChange={setForm} onClose={() => setModal(null)} onSubmit={submitForm} />}
    {modal === "status" && selectedClient && <ClientStatusModal client={selectedClient} error={error} submitting={submitting} onClose={() => setModal(null)} onConfirm={() => void changeStatus()} />}
    {modal === "assign" && selectedClient && <ClientAssignModal client={selectedClient} users={assignableUsers} selectedUserId={selectedUserId} error={error} loading={submitting} onChange={setSelectedUserId} onClose={() => setModal(null)} onSubmit={assignUser} />}
    {modal === "view" && selectedClient && <ClientUsersModal client={selectedClient} users={assignedUsers} error={error} loading={submitting} revokingUserId={revokingUserId} onRevoke={(user) => void revokeUser(user)} onClose={() => setModal(null)} />}
    {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg"><span className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>{toast}</div>}
  </div>;
}

function ModalShell({ title, description, icon, children, onClose, disabled = false, width = "max-w-lg" }: { title: string; description: React.ReactNode; icon: string; children: React.ReactNode; onClose: () => void; disabled?: boolean; width?: string }) {
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"><div className={`w-full ${width} overflow-hidden rounded-xl border border-border bg-white shadow-xl`}><div className="flex items-start justify-between border-b border-border px-6 py-4"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><span className="material-symbols-outlined">{icon}</span></div><div><h2 className="text-base font-semibold">{title}</h2><div className="mt-1 text-xs text-text-secondary">{description}</div></div></div><button type="button" aria-label="Tutup" disabled={disabled} onClick={onClose} className="text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined">close</span></button></div>{children}</div></div>;
}

function ClientFormModal({ mode, clientName, form, error, submitting, onChange, onClose, onSubmit }: { mode: "add" | "edit"; clientName?: string; form: FormState; error: string | null; submitting: boolean; onChange: (form: FormState) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <ModalShell title={mode === "add" ? "Tambah Klien Baru" : "Edit Master Klien"} description={mode === "add" ? "Tambahkan entitas baru ke master data klien." : <>Perbarui data <strong>{clientName}</strong>.</>} icon={mode === "add" ? "add_business" : "edit_square"} onClose={onClose} disabled={submitting} width="max-w-xl"><form onSubmit={onSubmit} className="space-y-4 p-6">{error && <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}<div className="rounded-lg border border-status-vouchered-border bg-primary-subtle p-3 text-xs leading-relaxed text-primary"><strong>Kode klien harus unik.</strong> Kode digunakan sebagai identitas referensi pada proses invoice dan voucher.</div><label className="block text-xs font-semibold">Kode Klien<input required maxLength={50} value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase() })} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 font-mono font-normal outline-none focus:ring-2 focus:ring-focus-ring/30" placeholder="Contoh: CL-RT-0082" /></label><label className="block text-xs font-semibold">Nama Entitas Klien<input required maxLength={255} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 font-normal outline-none focus:ring-2 focus:ring-focus-ring/30" placeholder="Contoh: PT Retail Mandiri Indonesia" /></label><div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-surface-muted">Batal</button><button type="submit" disabled={submitting} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{submitting ? "Menyimpan..." : mode === "add" ? "Simpan Klien" : "Perbarui Klien"}</button></div></form></ModalShell>;
}

function ClientStatusModal({ client, error, submitting, onClose, onConfirm }: { client: ManagedClient; error: string | null; submitting: boolean; onClose: () => void; onConfirm: () => void }) {
  return <ModalShell title={client.is_active ? "Nonaktifkan Klien?" : "Aktifkan Kembali Klien?"} description={<><strong>{client.code}</strong> — {client.name}</>} icon={client.is_active ? "domain_disabled" : "domain_add"} onClose={onClose} disabled={submitting} width="max-w-md"><div className="p-6"><p className="text-sm leading-relaxed text-text-secondary">{client.is_active ? "Klien tidak lagi tersedia untuk proses dan penugasan baru. Data serta histori tetap tersimpan." : "Klien akan kembali tersedia untuk proses operasional dan penugasan baru."}</p>{error && <div role="alert" className="mt-4 rounded bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}</div><div className="flex justify-end gap-3 border-t border-border bg-surface-muted px-6 py-3"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded-lg border border-border bg-white px-4 text-xs font-semibold">Batal</button><button type="button" disabled={submitting} onClick={onConfirm} className={`h-10 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-60 ${client.is_active ? "bg-danger" : "bg-success"}`}>{submitting ? "Memproses..." : client.is_active ? "Nonaktifkan Klien" : "Aktifkan Klien"}</button></div></ModalShell>;
}

function ClientAssignModal({ client, users, selectedUserId, error, loading, onChange, onClose, onSubmit }: { client: ManagedClient; users: ManagedUser[]; selectedUserId: string; error: string | null; loading: boolean; onChange: (userId: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <ModalShell title="Atur Penugasan Intake" description={<>Tambahkan staf Intake aktif ke <strong>{client.name}</strong>.</>} icon="assignment_ind" onClose={onClose} disabled={loading}><form onSubmit={onSubmit} className="space-y-4 p-6">{error && <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}<label className="block text-xs font-semibold">Staf Intake<select required disabled={loading || users.length === 0} value={selectedUserId} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong bg-white px-3 font-normal outline-none focus:ring-2 focus:ring-focus-ring/30 disabled:bg-surface-muted"><option value="">{loading ? "Memuat staf..." : users.length ? "Pilih staf Intake" : "Semua staf Intake aktif sudah ditugaskan"}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></label><p className="text-xs text-text-secondary">Reviewer dikelola oleh Service Lead dan bersifat read-only pada halaman ini.</p><div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" disabled={loading} onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Batal</button><button type="submit" disabled={loading || !selectedUserId} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-white disabled:opacity-60">{loading ? "Memproses..." : "Tugaskan Staf"}</button></div></form></ModalShell>;
}

function ClientUsersModal({ client, users, error, loading, revokingUserId, onRevoke, onClose }: { client: ManagedClient; users: ManagedUser[]; error: string | null; loading: boolean; revokingUserId: string | null; onRevoke: (user: ManagedUser) => void; onClose: () => void }) {
  return <ModalShell title="Ringkasan Penugasan" description={<><strong>{client.code}</strong> — {client.name}</>} icon="groups" onClose={onClose} width="max-w-xl"><div className="p-6">{loading ? <div className="space-y-3 animate-pulse">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 rounded bg-surface-muted" />)}</div> : error ? <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div> : users.length === 0 ? <div className="py-8 text-center text-sm text-text-disabled"><span className="material-symbols-outlined mb-2 block text-[36px]">group_off</span>Belum ada user yang ditugaskan.</div> : <ul className="divide-y divide-surface-muted rounded-lg border border-border">{users.map((user) => <li key={user.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-text-primary">{user.name}</p><p className="text-xs text-text-secondary">{user.email}</p></div><div className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${user.role === "FINANCE_REVIEWER" ? "bg-success-subtle text-success" : "bg-primary-subtle text-primary"}`}>{user.role}</span>{user.role === "INTAKE" ? <button type="button" title={`Cabut ${user.name} dari klien`} disabled={revokingUserId !== null} onClick={() => onRevoke(user)} className="rounded p-1 text-danger hover:bg-danger-subtle disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">person_remove</span></button> : <span title="Reviewer dikelola oleh Service Lead" className="material-symbols-outlined text-[18px] text-text-disabled">lock</span>}</div></li>)}</ul>}</div><div className="flex justify-end border-t border-border bg-surface-muted px-6 py-3"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-border bg-white px-4 text-xs font-semibold">Tutup</button></div></ModalShell>;
}

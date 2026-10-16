"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clientService, ReviewerAssignmentClient, ReviewerOption } from "@/lib/api";

type AssignmentStatus = "ASSIGNED" | "UNASSIGNED" | "";
type Props = { initialPage: number; initialPageSize: number; initialSearch: string; initialStatus: AssignmentStatus };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export default function ReviewerAssignmentManagement({ initialPage, initialPageSize, initialSearch, initialStatus }: Props) {
  const router = useRouter();
  const requestId = useRef(0);
  const [rows, setRows] = useState<ReviewerAssignmentClient[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<AssignmentStatus>(initialStatus);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ReviewerAssignmentClient | null>(null);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3500); };
  const loadAssignments = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const result = await clientService.listReviewerAssignments({ page, pageSize, search: search.trim(), status });
      if (currentRequest !== requestId.current) return;
      setRows(result.items); setTotal(result.total); setTotalPages(result.total_pages);
      setAssignedCount(result.assigned_count); setUnassignedCount(result.unassigned_count);
      if (result.total_pages > 0 && page > result.total_pages) setPage(result.total_pages);
    } catch (err) { if (currentRequest === requestId.current) setError(err instanceof Error ? err.message : "Gagal memuat penugasan reviewer."); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [page, pageSize, search, status]);

  useEffect(() => { const timeout = window.setTimeout(() => void loadAssignments(), 300); return () => window.clearTimeout(timeout); }, [loadAssignments]);
  useEffect(() => { void clientService.listReviewerOptions().then(setReviewers).catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat reviewer aktif.")); }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("page_size", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    const query = params.toString(); const nextUrl = query ? `/reviewer-assignments?${query}` : "/reviewer-assignments";
    const timeout = window.setTimeout(() => { if (`${window.location.pathname}${window.location.search}` !== nextUrl) router.replace(nextUrl, { scroll: false }); }, 300);
    return () => window.clearTimeout(timeout);
  }, [page, pageSize, router, search, status]);
  useEffect(() => { setPage(initialPage); setPageSize(initialPageSize); setSearch(initialSearch); setStatus(initialStatus); }, [initialPage, initialPageSize, initialSearch, initialStatus]);
  useEffect(() => { if (!selectedClient) return; const close = (event: KeyboardEvent) => event.key === "Escape" && !submitting && setSelectedClient(null); document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [selectedClient, submitting]);

  const openManage = (client: ReviewerAssignmentClient) => { setSelectedClient(client); setSelectedReviewerId(""); setModalError(null); };
  const assignReviewer = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedClient || !selectedReviewerId) return;
    setSubmitting(true); setModalError(null);
    try { await clientService.assignReviewer(selectedClient.client_id, selectedReviewerId); setSelectedClient(null); notify("Reviewer berhasil ditugaskan ke klien."); await loadAssignments(); }
    catch (err) { setModalError(err instanceof Error ? err.message : "Gagal menugaskan reviewer."); }
    finally { setSubmitting(false); }
  };
  const revokeReviewer = async (reviewer: ReviewerOption) => {
    if (!selectedClient || !window.confirm(`Cabut ${reviewer.name} dari ${selectedClient.client_name}?`)) return;
    setSubmitting(true); setModalError(null);
    try {
      await clientService.revokeReviewer(selectedClient.client_id, reviewer.id);
      setSelectedClient((current) => current ? { ...current, active_reviewers: current.active_reviewers.filter((item) => item.id !== reviewer.id), assignment_status: current.active_reviewers.length === 1 ? "UNASSIGNED" : "ASSIGNED" } : null);
      notify("Penugasan reviewer berhasil dicabut."); await loadAssignments();
    } catch (err) { setModalError(err instanceof Error ? err.message : "Gagal mencabut reviewer."); }
    finally { setSubmitting(false); }
  };

  const availableReviewers = selectedClient ? reviewers.filter((reviewer) => !selectedClient.active_reviewers.some((assigned) => assigned.id === reviewer.id)) : [];
  const firstItem = total ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, total);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1);

  return <div className="flex w-full flex-col pb-8">
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><span>Konsol Service Lead</span><span className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span><span className="font-semibold text-text-primary">Penugasan Reviewer</span></nav>
    <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning-subtle text-warning shadow-sm"><span className="material-symbols-outlined text-[27px]">supervisor_account</span></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Manajemen Penugasan Reviewer</h1><span className="rounded bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold uppercase text-warning">Service Lead</span></div><p className="mt-1 text-sm text-text-secondary">Tetapkan atau cabut Finance Reviewer untuk setiap klien dan pantau cakupan penugasan aktif.</p></div></div><button type="button" onClick={() => void loadAssignments()} disabled={loading} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-xs font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-60"><span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>refresh</span>Sinkronkan Data</button></header>

    <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3"><StatCard label="Total Klien" value={assignedCount + unassignedCount} detail="Entitas terdaftar" icon="domain" tone="neutral" /><StatCard label="Reviewer Tercakup" value={assignedCount} detail="Klien memiliki reviewer aktif" icon="verified" tone="success" /><StatCard label="Perlu Penugasan" value={unassignedCount} detail="Klien tanpa reviewer aktif" icon="warning" tone={unassignedCount ? "warning" : "success"} /></section>
    {error && <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg"><div className="flex gap-3"><span className="material-symbols-outlined">error</span><div><p className="font-semibold">Data penugasan tidak dapat diproses</p><p className="text-xs">{error}</p></div></div><button type="button" onClick={() => void loadAssignments()} className="rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">Coba lagi</button></div>}
    <section className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex flex-1 flex-wrap gap-3"><label className="relative min-w-[250px] flex-1 md:max-w-sm"><span className="sr-only">Cari klien</span><span className="material-symbols-outlined pointer-events-none absolute left-3 top-2.5 text-[20px] text-text-secondary">search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari kode atau nama klien..." className="h-10 w-full rounded-lg border border-border pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-focus-ring/30" /></label><select value={status} onChange={(event) => { setStatus(event.target.value as AssignmentStatus); setPage(1); }} className="h-10 rounded-lg border border-border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-focus-ring/30"><option value="">Semua Status Penugasan</option><option value="ASSIGNED">Reviewer Aktif</option><option value="UNASSIGNED">Belum Ada Reviewer</option></select>{(search || status) && <button type="button" onClick={() => { setSearch(""); setStatus(""); setPage(1); }} className="flex h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-text-secondary hover:bg-surface-muted"><span className="material-symbols-outlined text-[17px]">restart_alt</span>Reset</button>}</div><span className="text-xs text-text-secondary"><strong className="text-text-primary">{total}</strong> klien ditemukan</span></section>

    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] border-collapse text-left"><thead><tr className="h-11 bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary"><th className="w-36 px-4 py-2">Kode Klien</th><th className="min-w-64 px-4 py-2">Nama Klien</th><th className="min-w-72 px-4 py-2">Reviewer Aktif</th><th className="w-48 px-4 py-2">Status Penugasan</th><th className="w-40 px-4 py-2 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-surface-muted text-xs">{loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="h-16 animate-pulse"><td colSpan={5} className="px-4"><div className="h-8 rounded bg-surface-muted" /></td></tr>) : rows.map((client) => <tr key={client.client_id} className={`h-16 transition hover:bg-primary-subtle/30 ${client.client_is_active ? "" : "opacity-65"}`}><td className="px-4 py-2 font-mono font-semibold text-primary">{client.client_code}</td><td className="px-4 py-2"><p className="font-semibold text-text-primary">{client.client_name}</p><p className="mt-0.5 text-[11px] text-text-disabled">{client.client_is_active ? "Klien aktif" : "Klien nonaktif"}</p></td><td className="px-4 py-2"><ReviewerChips reviewers={client.active_reviewers} /></td><td className="px-4 py-2"><AssignmentBadge status={client.assignment_status} /></td><td className="px-4 py-2 text-right"><button type="button" onClick={() => openManage(client)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-primary transition hover:bg-primary-subtle"><span className="material-symbols-outlined text-[17px]">manage_accounts</span>{client.assignment_status === "ASSIGNED" ? "Kelola" : "Tetapkan"}</button></td></tr>)}</tbody></table></div>
      <div className="divide-y divide-surface-muted md:hidden">{loading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="animate-pulse p-4"><div className="h-32 rounded bg-surface-muted" /></div>) : rows.map((client) => <article key={client.client_id} className={`space-y-3 p-4 ${client.client_is_active ? "" : "opacity-65"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold text-primary">{client.client_code}</p><h2 className="mt-1 text-sm font-semibold">{client.client_name}</h2></div><AssignmentBadge status={client.assignment_status} /></div><ReviewerChips reviewers={client.active_reviewers} /><button type="button" onClick={() => openManage(client)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-primary"><span className="material-symbols-outlined text-[17px]">manage_accounts</span>Kelola Reviewer</button></article>)}</div>
      {!loading && rows.length === 0 && <div className="px-4 py-16 text-center"><span className="material-symbols-outlined mb-2 block text-[44px] text-text-disabled">person_search</span><h2 className="font-semibold">Tidak ada klien ditemukan</h2><p className="mt-1 text-xs text-text-secondary">Coba ubah pencarian atau filter penugasan.</p></div>}
      {!loading && <footer className="flex min-h-14 flex-col items-center justify-between gap-3 border-t border-border bg-surface-muted/60 px-4 py-3 text-xs text-text-secondary sm:flex-row"><span>Menampilkan <strong className="text-text-primary">{firstItem}-{lastItem}</strong> dari <strong className="text-text-primary">{total}</strong> klien</span><div className="flex items-center gap-4"><label className="hidden items-center gap-2 sm:flex">Baris:<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded border border-border bg-white px-2 font-semibold"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><nav aria-label="Pagination penugasan reviewer" className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded p-1 disabled:text-text-disabled"><span className="material-symbols-outlined text-[19px]">chevron_left</span></button>{pages.map((item, index) => <Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span>…</span>}<button type="button" aria-current={item === page ? "page" : undefined} onClick={() => setPage(item)} className={`flex h-8 min-w-8 items-center justify-center rounded px-2 font-semibold ${item === page ? "bg-primary text-white" : "hover:bg-surface-muted"}`}>{item}</button></Fragment>)}<button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded p-1 disabled:text-text-disabled"><span className="material-symbols-outlined text-[19px]">chevron_right</span></button></nav></div></footer>}
    </div>

    {selectedClient && <div role="dialog" aria-modal="true" aria-labelledby="reviewer-modal-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"><div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-xl"><div className="flex items-start justify-between border-b border-border px-6 py-4"><div><h2 id="reviewer-modal-title" className="text-base font-semibold">Kelola Reviewer</h2><p className="mt-1 text-xs text-text-secondary"><strong>{selectedClient.client_code}</strong> — {selectedClient.client_name}</p></div><button type="button" disabled={submitting} onClick={() => setSelectedClient(null)} className="text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined">close</span></button></div><div className="space-y-5 p-6">{modalError && <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-danger">{modalError}</div>}<div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Reviewer Saat Ini</h3>{selectedClient.active_reviewers.length ? <ul className="divide-y divide-surface-muted rounded-lg border border-border">{selectedClient.active_reviewers.map((reviewer) => <li key={reviewer.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-subtle text-xs font-semibold text-success">{initials(reviewer.name)}</div><div><p className="text-xs font-semibold">{reviewer.name}</p><p className="text-[11px] text-text-secondary">{reviewer.email}</p></div></div><button type="button" title={`Cabut ${reviewer.name}`} disabled={submitting} onClick={() => void revokeReviewer(reviewer)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-danger hover:bg-danger-subtle disabled:opacity-50"><span className="material-symbols-outlined text-[17px]">person_remove</span>Cabut</button></li>)}</ul> : <div className="rounded-lg border border-dashed border-status-exception-border bg-warning-subtle p-4 text-center text-xs text-warning">Belum ada reviewer aktif untuk klien ini.</div>}</div><form onSubmit={assignReviewer} className="space-y-3 border-t border-border pt-4"><label className="block text-xs font-semibold">Tambahkan Reviewer<select value={selectedReviewerId} disabled={submitting || !selectedClient.client_is_active || availableReviewers.length === 0} onChange={(event) => setSelectedReviewerId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong bg-white px-3 font-normal disabled:bg-surface-muted"><option value="">{!selectedClient.client_is_active ? "Klien nonaktif tidak dapat menerima penugasan" : availableReviewers.length ? "Pilih Finance Reviewer aktif" : "Semua reviewer aktif sudah ditugaskan"}</option>{availableReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name} — {reviewer.email}</option>)}</select></label><div className="flex justify-end gap-3"><button type="button" disabled={submitting} onClick={() => setSelectedClient(null)} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Tutup</button><button type="submit" disabled={submitting || !selectedReviewerId || !selectedClient.client_is_active} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-white disabled:opacity-50">{submitting ? "Memproses..." : "Tetapkan Reviewer"}</button></div></form></div></div></div>}
    {toast && <div role="status" className="fixed bottom-6 right-6 z-[80] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg"><span className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>{toast}</div>}
  </div>;
}

function StatCard({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: string; tone: "neutral" | "success" | "warning" }) {
  const toneClass = tone === "success" ? "bg-success-subtle text-success" : tone === "warning" ? "bg-warning-subtle text-warning" : "bg-surface-muted text-text-secondary";
  return <div className="flex items-center justify-between rounded-xl border border-border/70 bg-white p-4 shadow-sm"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{label}</p><p className="mt-1 font-mono text-2xl font-bold text-text-primary">{value}</p><p className="mt-1 text-xs text-text-secondary">{detail}</p></div><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClass}`}><span className="material-symbols-outlined text-[24px]">{icon}</span></div></div>;
}

function ReviewerChips({ reviewers }: { reviewers: ReviewerOption[] }) {
  if (!reviewers.length) return <span className="text-xs italic text-text-disabled">Belum ada reviewer ditugaskan</span>;
  return <div className="flex flex-wrap gap-1.5">{reviewers.slice(0, 3).map((reviewer) => <span key={reviewer.id} title={reviewer.email} className="inline-flex items-center gap-1.5 rounded bg-primary-subtle px-2 py-1 text-[11px] font-semibold text-primary"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">{initials(reviewer.name).slice(0, 1)}</span>{reviewer.name}</span>)}{reviewers.length > 3 && <span className="rounded bg-surface-muted px-2 py-1 text-[11px] font-semibold text-text-secondary">+{reviewers.length - 3}</span>}</div>;
}

function AssignmentBadge({ status }: { status: "ASSIGNED" | "UNASSIGNED" }) {
  const assigned = status === "ASSIGNED";
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${assigned ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}><span className="material-symbols-outlined text-[14px]">{assigned ? "check_circle" : "warning"}</span>{assigned ? "Tercakup Aktif" : "Belum Ada Reviewer"}</span>;
}

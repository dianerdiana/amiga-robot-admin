"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClientAssignedUser, ManagedClient } from "@/lib/api";

type Props = {
  clients: ManagedClient[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAssign: (client: ManagedClient) => void;
  onView: (client: ManagedClient) => void;
  onEdit: (client: ManagedClient) => void;
  onStatus: (client: ManagedClient) => void;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const formatDate = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));

function People({ users, empty, tone = "primary" }: { users: ClientAssignedUser[]; empty: string; tone?: "primary" | "accent" }) {
  if (!users.length) return <span className="text-xs italic text-text-disabled">{empty}</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {users.slice(0, 3).map((user, index) => (
          <div key={user.id} title={`${user.name} — ${user.email}`} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm ${tone === "accent" || index % 2 ? "bg-secondary" : "bg-primary-container"}`}>{initials(user.name)}</div>
        ))}
      </div>
      <span className="whitespace-nowrap text-xs text-text-secondary">{users.length} {tone === "accent" ? "staf" : "reviewer"}</span>
    </div>
  );
}

function ClientStatus({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-success-subtle text-success" : "bg-surface-muted text-text-secondary"}`}><span className="material-symbols-outlined text-[14px]">{active ? "check_circle" : "cancel"}</span>{active ? "Aktif" : "Nonaktif"}</span>;
}

function ReviewerStatus({ client }: { client: ManagedClient }) {
  const assigned = client.active_reviewers.length > 0;
  return <span className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-semibold ${assigned ? "bg-status-reviewed-bg text-status-reviewed-fg" : "bg-warning-subtle text-status-exception-fg"}`}><span className="material-symbols-outlined text-[15px]">{assigned ? "verified" : "person_off"}</span>{assigned ? "Reviewer Aktif" : "Belum Ada Reviewer"}</span>;
}

function ActionMenu({ client, onAssign, onView, onEdit, onStatus }: Pick<Props, "onAssign" | "onView" | "onEdit" | "onStatus"> & { client: ManagedClient }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 224;
      const menuHeight = 184;
      setPosition({
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
        top: rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
      });
    }
    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const closeMenu = () => setOpen(false);
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [open]);

  const run = (action: (client: ManagedClient) => void) => {
    setOpen(false);
    action(client);
  };
  const itemClass = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-text-secondary transition hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      <button ref={buttonRef} type="button" title="Buka menu aksi klien" aria-label={`Buka menu aksi ${client.name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${open ? "border-primary bg-primary-subtle text-primary" : "border-transparent text-text-secondary hover:border-border hover:bg-surface-muted hover:text-primary"}`}><span className="material-symbols-outlined text-[20px]">more_vert</span></button>
      {open && createPortal(
        <div ref={menuRef} role="menu" aria-label={`Aksi untuk ${client.name}`} style={{ top: position.top, left: position.left }} className="fixed z-[80] w-56 overflow-hidden rounded-lg border border-border bg-white py-1 shadow-xl">
          <button type="button" role="menuitem" title="Lihat ringkasan seluruh penugasan" onClick={() => run(onView)} className={itemClass}><span className="material-symbols-outlined text-[18px] text-primary">visibility</span><span>Lihat Penugasan</span></button>
          <button type="button" role="menuitem" title={client.is_active ? "Atur penugasan staf Intake" : "Aktifkan klien untuk mengatur penugasan Intake"} disabled={!client.is_active} onClick={() => run(onAssign)} className={itemClass}><span className="material-symbols-outlined text-[18px] text-primary">person_add</span><span>Atur Staf Intake</span></button>
          <button type="button" role="menuitem" title="Edit master data klien" onClick={() => run(onEdit)} className={itemClass}><span className="material-symbols-outlined text-[18px] text-primary">edit</span><span>Edit Klien</span></button>
          <div className="my-1 border-t border-border" />
          <button type="button" role="menuitem" title={client.is_active ? "Nonaktifkan klien" : "Aktifkan kembali klien"} onClick={() => run(onStatus)} className={`${itemClass} ${client.is_active ? "text-danger hover:bg-danger-subtle hover:text-danger" : "text-success hover:bg-success-subtle hover:text-success"}`}><span className="material-symbols-outlined text-[18px]">{client.is_active ? "domain_disabled" : "domain_add"}</span><span>{client.is_active ? "Nonaktifkan Klien" : "Aktifkan Klien"}</span></button>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function ClientTable({ clients, total, page, pageSize, totalPages, loading, onPageChange, onPageSizeChange, onAssign, onView, onEdit, onStatus }: Props) {
  const firstItem = total ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, total);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1);
  const actionProps = { onAssign, onView, onEdit, onStatus };

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-surface shadow-sm">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1100px] border-collapse text-left">
          <thead><tr className="h-11 bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary"><th className="w-36 px-4 py-2">Kode Klien</th><th className="min-w-60 px-4 py-2">Nama Entitas Klien</th><th className="min-w-48 px-4 py-2">Reviewer</th><th className="min-w-52 px-4 py-2">Staf Intake</th><th className="w-44 px-4 py-2 text-center">Status Reviewer</th><th className="w-28 px-4 py-2">Status Klien</th><th className="w-20 px-4 py-2 text-right">Aksi</th></tr></thead>
          <tbody className="divide-y divide-surface-muted text-xs">
            {loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="h-16 animate-pulse"><td colSpan={7} className="px-4"><div className="h-8 rounded bg-surface-muted" /></td></tr>) : clients.map((client) => (
              <tr key={client.id} className={`group h-16 transition hover:bg-primary-subtle/30 ${client.is_active ? "" : "opacity-70"}`}>
                <td className="px-4 py-2 font-mono font-semibold text-primary">{client.code}</td>
                <td className="px-4 py-2"><p className="font-semibold text-text-primary">{client.name}</p><p className="mt-0.5 text-[11px] text-text-disabled">Terdaftar {formatDate(client.created_at)}</p></td>
                <td className="px-4 py-2"><People users={client.active_reviewers} empty="Belum ada reviewer" /></td>
                <td className="px-4 py-2"><People users={client.assigned_intake} empty="Belum ada staf Intake" tone="accent" /></td>
                <td className="px-4 py-2 text-center"><ReviewerStatus client={client} /></td>
                <td className="px-4 py-2"><ClientStatus active={client.is_active} /></td>
                <td className="px-4 py-2"><div className="flex justify-end"><ActionMenu client={client} {...actionProps} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-surface-muted lg:hidden">
        {loading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="animate-pulse p-4"><div className="h-36 rounded-lg bg-surface-muted" /></div>) : clients.map((client) => (
          <article key={client.id} className={`space-y-3 p-4 ${client.is_active ? "" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold text-primary">{client.code}</p><h2 className="mt-1 text-sm font-semibold text-text-primary">{client.name}</h2><p className="mt-0.5 text-[11px] text-text-disabled">Terdaftar {formatDate(client.created_at)}</p></div><div className="flex items-center gap-1"><ClientStatus active={client.is_active} /><ActionMenu client={client} {...actionProps} /></div></div>
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface-muted/70 p-3 sm:grid-cols-2"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-disabled">Reviewer</p><People users={client.active_reviewers} empty="Belum ada reviewer" /></div><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-disabled">Staf Intake</p><People users={client.assigned_intake} empty="Belum ada staf Intake" tone="accent" /></div></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><ReviewerStatus client={client} /><span className="text-[11px] text-text-disabled">Gunakan menu aksi untuk mengelola klien</span></div>
          </article>
        ))}
      </div>

      {!loading && clients.length === 0 && <div className="px-4 py-16 text-center"><span className="material-symbols-outlined mb-2 block text-[44px] text-text-disabled">domain_disabled</span><h2 className="text-base font-semibold">Tidak ada entitas klien ditemukan</h2><p className="mt-1 text-xs text-text-secondary">Coba ubah pencarian atau filter penugasan.</p></div>}
      {!loading && <footer className="flex min-h-14 flex-col items-center justify-between gap-3 border-t border-border bg-surface-muted/60 px-4 py-3 text-xs text-text-secondary sm:flex-row"><span>Menampilkan <strong className="text-text-primary">{firstItem}-{lastItem}</strong> dari <strong className="text-text-primary">{total}</strong> klien</span><div className="flex items-center gap-4"><label className="hidden items-center gap-2 sm:flex">Baris:<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-8 rounded border border-border bg-white px-2 font-semibold text-text-primary"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><nav aria-label="Pagination klien" className="flex items-center gap-1"><button type="button" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded p-1 hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-text-disabled"><span className="material-symbols-outlined text-[19px]">chevron_left</span></button>{pages.map((item, index) => <Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span className="px-1 text-text-disabled">…</span>}<button type="button" aria-current={item === page ? "page" : undefined} onClick={() => onPageChange(item)} className={`flex h-8 min-w-8 items-center justify-center rounded px-2 font-semibold ${item === page ? "bg-primary text-white" : "text-text-primary hover:bg-surface-muted"}`}>{item}</button></Fragment>)}<button type="button" aria-label="Halaman berikutnya" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded p-1 hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-text-disabled"><span className="material-symbols-outlined text-[19px]">chevron_right</span></button></nav></div></footer>}
    </div>
  );
}

import { ManagedUser, ManageableUserRole } from "@/lib/api";

const roleClasses: Record<ManageableUserRole, string> = {
  INTAKE: "bg-primary-subtle text-primary border-status-vouchered-border",
  FINANCE_REVIEWER: "bg-success-subtle text-success border-status-reviewed-border",
  SERVICE_LEAD: "bg-warning-subtle text-warning border-status-exception-border",
  SYSTEM_ADMIN: "bg-status-sent-bg text-status-sent-fg border-status-sent-border",
};
const userCode = (user: ManagedUser) => `USR-${user.id.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

type Props = {
  users: ManagedUser[];
  total: number;
  loading: boolean;
  onEdit: (user: ManagedUser) => void;
  onStatus: (user: ManagedUser) => void;
  onCopy: (email: string) => void;
};

export default function UserTable({ users, total, loading, onEdit, onStatus, onCopy }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto"><table className="w-full border-collapse text-left">
        <thead><tr className="h-10 border-b border-border bg-surface-muted">{["Nama & Identitas", "Email Pengguna", "Peran", "Status Akses", "Dibuat", "Aksi"].map((heading) => <th key={heading} className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary ${heading === "Aksi" ? "text-right" : ""}`}>{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-surface-muted text-xs">
          {loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="h-14 animate-pulse"><td colSpan={6} className="px-4"><div className="h-7 rounded bg-surface-muted" /></td></tr>) : users.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-14 text-center text-text-disabled"><span className="material-symbols-outlined mb-2 block text-[36px]">group_off</span>{total ? "Tidak ada pengguna yang cocok dengan filter." : "Belum ada pengguna."}</td></tr>
          ) : users.map((user) => (
            <tr key={user.id} className={`h-14 transition-colors hover:bg-background ${user.is_active ? "" : "opacity-75"}`}>
              <td className="px-4 py-2"><div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary">{initials(user.name)}</div><div><div className="font-semibold text-text-primary">{user.name}</div><div className="font-mono text-[11px] text-text-disabled">{userCode(user)}</div></div></div></td>
              <td className="px-4 py-2"><div className="flex items-center gap-1.5 text-text-secondary"><span>{user.email}</span><button type="button" title="Salin email" onClick={() => onCopy(user.email)} className="rounded p-0.5 text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined text-[15px]">content_copy</span></button></div></td>
              <td className="px-4 py-2"><span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${roleClasses[user.role]}`}><span className="material-symbols-outlined mr-1 text-[13px]">badge</span>{user.role}</span></td>
              <td className="px-4 py-2"><span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${user.is_active ? "border-status-reviewed-border bg-success-subtle text-success" : "border-border bg-surface-muted text-text-secondary"}`}><span className="material-symbols-outlined mr-1 text-[13px]">{user.is_active ? "check_circle" : "cancel"}</span>{user.is_active ? "Aktif" : "Nonaktif"}</span></td>
              <td className="px-4 py-2 text-text-secondary">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(user.created_at))}</td>
              <td className="px-4 py-2 text-right"><div className="flex justify-end gap-1"><button type="button" title="Edit pengguna" onClick={() => onEdit(user)} className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-primary"><span className="material-symbols-outlined text-[18px]">edit</span></button><button type="button" title={user.is_active ? "Nonaktifkan akses" : "Aktifkan akses"} onClick={() => onStatus(user)} className={`rounded p-1 ${user.is_active ? "text-danger hover:bg-danger-subtle" : "text-success hover:bg-success-subtle"}`}><span className="material-symbols-outlined text-[18px]">{user.is_active ? "block" : "check_circle"}</span></button></div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {!loading && <div className="border-t border-border bg-surface-muted px-4 py-3 text-xs text-text-secondary">Menampilkan <strong>{users.length}</strong> dari <strong>{total}</strong> pengguna</div>}
    </div>
  );
}

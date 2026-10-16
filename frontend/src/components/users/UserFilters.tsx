import { USER_ROLES } from "./types";

type Props = {
  search: string;
  role: string;
  status: string;
  onSearchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReset: () => void;
  onAdd: () => void;
};

export default function UserFilters(props: Props) {
  const hasFilter = props.search || props.role || props.status;
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <label className="relative min-w-[240px] flex-1 md:max-w-xs">
          <span className="sr-only">Cari pengguna</span>
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-2.5 text-[20px] text-text-secondary">search</span>
          <input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Cari nama atau email pengguna..." className="h-10 w-full rounded-lg border border-border-strong bg-white pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-focus-ring/30" />
        </label>
        <select aria-label="Filter peran" value={props.role} onChange={(event) => props.onRoleChange(event.target.value)} className="h-10 min-w-40 rounded-lg border border-border-strong bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-focus-ring/30">
          <option value="">Semua Peran</option>
          {USER_ROLES.map((role) => <option key={role}>{role}</option>)}
        </select>
        <select aria-label="Filter status" value={props.status} onChange={(event) => props.onStatusChange(event.target.value)} className="h-10 min-w-36 rounded-lg border border-border-strong bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-focus-ring/30">
          <option value="">Semua Status</option><option value="true">Aktif</option><option value="false">Nonaktif</option>
        </select>
        {hasFilter && <button type="button" onClick={props.onReset} className="flex h-10 items-center gap-1 rounded-lg px-3 text-xs text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"><span className="material-symbols-outlined text-[18px]">restart_alt</span>Reset</button>}
      </div>
      <button type="button" onClick={props.onAdd} className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover active:bg-primary-active"><span className="material-symbols-outlined text-[20px]">person_add</span>Tambah Pengguna</button>
    </div>
  );
}


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
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        <label className="relative min-w-[220px] flex-1 md:max-w-xs">
          <span className="sr-only">Cari pengguna</span>
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-2.5 text-[18px] text-text-disabled">search</span>
          <input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Cari nama, kode atau email..." className="h-9 w-full rounded border border-border bg-white pl-9 pr-3 text-xs focus:ring-2 focus:ring-focus-ring" />
        </label>
        <select aria-label="Filter peran" value={props.role} onChange={(event) => props.onRoleChange(event.target.value)} className="h-9 rounded border border-border bg-white px-2.5 text-xs focus:ring-2 focus:ring-focus-ring">
          <option value="">Semua Peran</option>
          {USER_ROLES.map((role) => <option key={role}>{role}</option>)}
        </select>
        <select aria-label="Filter status" value={props.status} onChange={(event) => props.onStatusChange(event.target.value)} className="h-9 rounded border border-border bg-white px-2.5 text-xs focus:ring-2 focus:ring-focus-ring">
          <option value="">Semua Status</option><option value="true">Aktif</option><option value="false">Nonaktif</option>
        </select>
        {hasFilter && <button type="button" onClick={props.onReset} className="flex h-9 items-center gap-1 rounded px-2.5 text-xs text-text-secondary hover:bg-surface-muted"><span className="material-symbols-outlined text-[16px]">restart_alt</span>Reset</button>}
      </div>
      <button type="button" onClick={props.onAdd} className="flex h-9 shrink-0 items-center justify-center gap-2 rounded bg-primary px-4 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover"><span className="material-symbols-outlined text-[18px]">person_add</span>Tambah Pengguna</button>
    </div>
  );
}


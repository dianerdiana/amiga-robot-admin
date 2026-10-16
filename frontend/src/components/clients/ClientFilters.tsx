type Props = {
  search: string;
  status: string;
  reviewer: string;
  intake: string;
  total: number;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReviewerChange: (value: string) => void;
  onIntakeChange: (value: string) => void;
  onReset: () => void;
};

export default function ClientFilters(props: Props) {
  const hasFilters = props.search || props.status || props.reviewer || props.intake;
  return (
    <section className="mb-4 rounded-xl border border-border/70 bg-surface p-3.5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <label className="relative min-w-[250px] flex-1 xl:max-w-sm"><span className="sr-only">Cari klien</span><span className="material-symbols-outlined pointer-events-none absolute left-3 top-2.5 text-[20px] text-text-secondary">search</span><input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Cari nama atau kode klien..." className="h-10 w-full rounded-lg border border-border bg-white pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-focus-ring/30" /></label>
          <select aria-label="Filter status klien" value={props.status} onChange={(event) => props.onStatusChange(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-focus-ring/30"><option value="">Semua Status Klien</option><option value="true">Klien Aktif</option><option value="false">Klien Nonaktif</option></select>
          <select aria-label="Filter status reviewer" value={props.reviewer} onChange={(event) => props.onReviewerChange(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-focus-ring/30"><option value="">Semua Reviewer</option><option value="assigned">Reviewer Aktif</option><option value="unassigned">Belum Ada Reviewer</option></select>
          <select aria-label="Filter alokasi intake" value={props.intake} onChange={(event) => props.onIntakeChange(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-focus-ring/30"><option value="">Semua Alokasi Intake</option><option value="none">Belum Ada Intake</option><option value="single">Alokasi Tunggal</option><option value="complete">Alokasi Lengkap (&gt;1)</option></select>
        </div>
        <div className="flex items-center justify-between gap-3 xl:justify-end"><span className="whitespace-nowrap text-xs text-text-secondary"><strong className="text-text-primary">{props.total}</strong> entitas ditemukan</span>{hasFilters && <button type="button" onClick={props.onReset} className="flex h-9 items-center gap-1 rounded-lg bg-surface-muted px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-sunken hover:text-text-primary"><span className="material-symbols-outlined text-[17px]">restart_alt</span>Reset Filter</button>}</div>
      </div>
    </section>
  );
}

type Props = {
  total: number;
  active: number;
  withReviewer: number;
  withoutReviewer: number;
  activeIntake: number;
};

export default function ClientSummary({ total, active, withReviewer, withoutReviewer, activeIntake }: Props) {
  const cards = [
    {
      label: "Total Entitas Klien",
      value: total,
      detail: `${active} aktif dalam sistem`,
      icon: "corporate_fare",
      iconClass: "bg-surface-muted text-text-secondary",
      detailClass: "text-success",
    },
    {
      label: "Reviewer Ditugaskan",
      value: withReviewer,
      detail: withoutReviewer ? `${withoutReviewer} klien belum memiliki reviewer` : "Semua klien memiliki reviewer",
      icon: "badge",
      iconClass: withoutReviewer ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success",
      detailClass: withoutReviewer ? "text-warning" : "text-success",
    },
    {
      label: "Staf Intake Aktif",
      value: activeIntake,
      detail: "Siap dialokasikan ke klien",
      icon: "groups",
      iconClass: "bg-accent-subtle text-secondary",
      detailClass: "text-text-secondary",
    },
  ];

  return (
    <section aria-label="Statistik master klien" className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-surface p-4 shadow-sm">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{card.label}</span>
            <div className="mt-1 flex items-baseline gap-2"><strong className="font-mono text-2xl text-text-primary">{card.value}</strong>{card.label === "Total Entitas Klien" && <span className="text-xs text-text-secondary">entitas</span>}</div>
            <p className={`mt-2 flex items-center gap-1 text-xs ${card.detailClass}`}><span className="material-symbols-outlined text-[15px]">{card.label === "Reviewer Ditugaskan" && withoutReviewer ? "warning" : "check_circle"}</span>{card.detail}</p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.iconClass}`}><span className="material-symbols-outlined text-[26px]">{card.icon}</span></div>
        </div>
      ))}
    </section>
  );
}

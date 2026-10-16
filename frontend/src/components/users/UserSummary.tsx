export default function UserSummary({ total, active }: { total: number; active: number }) {
  const items = [
    { label: "Total Pengguna", value: total, color: "text-text-primary" },
    { label: "Aktif", value: active, color: "text-success" },
    { label: "Nonaktif", value: total - active, color: "text-text-secondary" },
  ];

  return (
    <div className="grid shrink-0 grid-cols-3 rounded-xl border border-border bg-surface p-1.5 text-center shadow-sm">
      {items.map((item) => (
        <div key={item.label} className="border-r border-surface-sunken px-3 py-1.5 last:border-r-0 sm:px-5">
          <span className={`block text-[11px] ${item.color}`}>{item.label}</span>
          <span className={`font-mono text-lg font-bold ${item.color}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}


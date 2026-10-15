import Link from "next/link";

export function ForbiddenState({ message, backHref = "/invoices" }: { message?: string; backHref?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-14 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <span aria-hidden="true" className="material-symbols-outlined text-[28px]">lock_person</span>
      </div>
      <h2 className="text-base font-bold">Akses Tidak Diberikan (403)</h2>
      <p className="mt-1 max-w-md text-xs text-text-secondary">
        {message ??
          "Anda tidak memiliki akses ke dokumen ini. Request ditugaskan pada klien di luar wewenang akun Anda."}
      </p>
      <Link
        href={backHref}
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded border border-border px-4 text-xs font-semibold text-text-primary no-underline hover:bg-surface-muted"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
        Kembali ke Antrean
      </Link>
    </div>
  );
}

export function ErrorBanner({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg">
      <div className="flex gap-3">
        <span aria-hidden="true" className="material-symbols-outlined">error</span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function PageSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        <p className="text-xs font-medium text-text-secondary">{label}</p>
      </div>
    </div>
  );
}

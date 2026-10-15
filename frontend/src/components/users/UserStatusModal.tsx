import { ManagedUser } from "@/lib/api";

export default function UserStatusModal({ user, error, submitting, onClose, onConfirm }: { user: ManagedUser; error: string | null; submitting: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="status-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-white shadow-lg">
        <div className="p-6">
          <div className="mb-4 flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-full ${user.is_active ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}><span className="material-symbols-outlined">{user.is_active ? "person_off" : "person_check"}</span></div><h2 id="status-modal-title" className="text-base font-semibold">{user.is_active ? "Nonaktifkan Akses Pengguna?" : "Aktifkan Kembali Pengguna?"}</h2></div>
          <p className="text-sm leading-relaxed text-text-secondary"><strong className="text-text-primary">{user.name}</strong> {user.is_active ? "akan langsung kehilangan akses pada request berikutnya. Data akun tetap tersimpan." : "akan dapat masuk dan menggunakan sistem kembali sesuai perannya."}</p>
          {error && <div role="alert" className="mt-4 rounded bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-border bg-surface-muted px-6 py-3"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded border border-border bg-white px-4 text-xs font-semibold">Batal</button><button type="button" disabled={submitting} onClick={onConfirm} className={`h-10 rounded px-4 text-xs font-semibold text-white disabled:opacity-60 ${user.is_active ? "bg-danger" : "bg-success"}`}>{submitting ? "Memproses..." : user.is_active ? "Nonaktifkan Pengguna" : "Aktifkan Pengguna"}</button></div>
      </div>
    </div>
  );
}

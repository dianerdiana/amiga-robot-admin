import React from "react";
import { ManageableUserRole } from "@/lib/api";
import { USER_ROLES, UserFormState } from "./types";

type Props = {
  mode: "add" | "edit";
  userName?: string;
  form: UserFormState;
  error: string | null;
  submitting: boolean;
  onChange: (form: UserFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
};

export default function UserFormModal({ mode, userName, form, error, submitting, onChange, onClose, onSubmit }: Props) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="user-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div><h2 id="user-form-title" className="text-base font-semibold">{mode === "add" ? "Tambah Pengguna Baru" : "Edit Pengguna"}</h2><p className="mt-1 text-xs text-text-secondary">{mode === "add" ? "Buat akun internal dan tetapkan satu peran." : `Perbarui profil ${userName}.`}</p></div>
          <button type="button" aria-label="Tutup" disabled={submitting} onClick={onClose} className="text-text-disabled hover:text-text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          {error && <div role="alert" className="rounded border border-danger bg-danger-subtle p-3 text-xs text-status-rejected-fg">{error}</div>}
          <label className="block text-xs font-semibold">Nama Lengkap<input required maxLength={255} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} className="mt-1 h-10 w-full rounded border border-border-strong px-3 font-normal focus:ring-2 focus:ring-focus-ring" placeholder="Contoh: Budi Santoso" /></label>
          <label className="block text-xs font-semibold">Email Pengguna<input required type="email" value={form.email} onChange={(event) => onChange({ ...form, email: event.target.value })} className="mt-1 h-10 w-full rounded border border-border-strong px-3 font-normal focus:ring-2 focus:ring-focus-ring" placeholder="budi@amiga.internal" /></label>
          <label className="block text-xs font-semibold">{mode === "add" ? "Password Sementara" : "Password Baru (opsional)"}<input required={mode === "add"} minLength={8} maxLength={128} type="password" value={form.password} onChange={(event) => onChange({ ...form, password: event.target.value })} className="mt-1 h-10 w-full rounded border border-border-strong px-3 font-normal focus:ring-2 focus:ring-focus-ring" placeholder="Minimal 8 karakter" /></label>
          <label className="block text-xs font-semibold">Peran Pengguna<select value={form.role} onChange={(event) => onChange({ ...form, role: event.target.value as ManageableUserRole })} className="mt-1 h-10 w-full rounded border border-border-strong px-3 font-normal focus:ring-2 focus:ring-focus-ring">{USER_ROLES.map((role) => <option key={role}>{role}</option>)}</select><span className="mt-1 block font-normal text-text-secondary">Setiap pengguna memiliki tepat satu peran.</span></label>
          <div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted">Batal</button><button type="submit" disabled={submitting} className="h-10 rounded bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{submitting ? "Menyimpan..." : mode === "add" ? "Simpan Pengguna" : "Perbarui Pengguna"}</button></div>
        </form>
      </div>
    </div>
  );
}


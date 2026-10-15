"use client";

import React, { useState, useMemo } from "react";

interface UserItem {
  id: string;
  code: string;
  name: string;
  email: string;
  role: "INTAKE" | "FINANCE_REVIEWER" | "SERVICE_LEAD" | "SYSTEM_ADMIN";
  status: "Aktif" | "Nonaktif";
  clients: string;
}

const INITIAL_USERS: UserItem[] = [
  {
    id: "1",
    code: "USR-10842",
    name: "Siti Rahmawati",
    email: "siti.rahmawati@amiga.internal",
    role: "INTAKE",
    status: "Aktif",
    clients: "Klien A, Klien B",
  },
  {
    id: "2",
    code: "USR-10843",
    name: "Budi Santoso",
    email: "budi.santoso@amiga.internal",
    role: "SYSTEM_ADMIN",
    status: "Aktif",
    clients: "Semua Klien (Sistem)",
  },
  {
    id: "3",
    code: "USR-10844",
    name: "Ahmad Hidayat",
    email: "ahmad.hidayat@amiga.internal",
    role: "FINANCE_REVIEWER",
    status: "Aktif",
    clients: "Klien A",
  },
  {
    id: "4",
    code: "USR-10845",
    name: "Dewi Lestari",
    email: "dewi.lestari@amiga.internal",
    role: "SERVICE_LEAD",
    status: "Aktif",
    clients: "Klien A, Klien B, Klien C",
  },
  {
    id: "5",
    code: "USR-10846",
    name: "Rian Pratama",
    email: "rian.pratama@amiga.internal",
    role: "INTAKE",
    status: "Nonaktif",
    clients: "Tidak Ada",
  },
  {
    id: "6",
    code: "USR-10847",
    name: "Eka Putri",
    email: "eka.putri@amiga.internal",
    role: "FINANCE_REVIEWER",
    status: "Aktif",
    clients: "Klien B, Klien C",
  },
];

export default function UserManagementView() {
  const [users, setUsers] = useState<UserItem[]>(INITIAL_USERS);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showConcurrencyAlert, setShowConcurrencyAlert] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<UserItem["role"]>("INTAKE");

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.code.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter ? u.role === roleFilter : true;
      const matchStatus = statusFilter ? u.status === statusFilter : true;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === "Aktif").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [users]);

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleToggleStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, status: u.status === "Aktif" ? "Nonaktif" : "Aktif" }
          : u
      )
    );
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) return;

    const newUser: UserItem = {
      id: String(Date.now()),
      code: `USR-${Math.floor(10000 + Math.random() * 90000)}`,
      name: formName,
      email: formEmail,
      role: formRole,
      status: "Aktif",
      clients: "Belum Ditugaskan",
    };

    setUsers([newUser, ...users]);
    setFormName("");
    setFormEmail("");
    setIsAddModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUser.id
          ? { ...u, name: formName, email: formEmail, role: formRole }
          : u
      )
    );
    setIsEditModalOpen(false);
    setSelectedUser(null);
  };

  const openEdit = (u: UserItem) => {
    setSelectedUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormRole(u.role);
    setIsEditModalOpen(true);
  };

  return (
    <div className="flex flex-col w-full pb-8">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 mb-3 text-xs text-[#475569]"
      >
        <span className="hover:text-[#0F172A] transition-colors cursor-pointer">
          Konsol System Admin
        </span>
        <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">
          chevron_right
        </span>
        <span className="font-semibold text-[#0F172A]">Pengguna</span>
      </nav>

      {/* Concurrency Alert Banner */}
      {showConcurrencyAlert && (
        <section
          role="alert"
          className="mb-6 rounded-lg bg-[#FEE2E2] border-l-4 border-[#B91C1C] p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[#B91C1C] text-[24px] mt-0.5 shrink-0">
                error
              </span>
              <div>
                <h2 className="font-semibold text-[#991B1B] text-sm mb-0.5">
                  Gagal Memperbarui Status Pengguna (Optimistic Concurrency Conflict)
                </h2>
                <p className="text-xs text-[#991B1B]">
                  Data pengguna di server telah diubah oleh sesi administrator lain beberapa saat yang lalu.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowConcurrencyAlert(false)}
              className="p-1 rounded text-[#991B1B] hover:bg-[#FCD34D]/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </section>
      )}

      {/* Header Area with Integrated Mini Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 max-w-2xl">
          <div className="w-12 h-12 rounded-lg bg-[#E0E7FF] text-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">
              manage_accounts
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Manajemen Pengguna
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
              Kelola akun pengguna internal AMIGA Robot Admin, perizinan peran tunggal, dan kontrol status akses aktif/nonaktif.
            </p>
          </div>
        </div>

        {/* Mini Stat Counter Summary */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-white rounded-lg border border-[#CBD5E1] shadow-xs shrink-0 text-center">
          <div className="px-3 sm:px-4 py-1.5 border-r border-[#F1F5F9]">
            <span className="block text-[11px] text-[#475569]">Total Pengguna</span>
            <span className="text-lg font-bold text-[#0F172A] font-mono">
              {stats.total}
            </span>
          </div>
          <div className="px-3 sm:px-4 py-1.5 border-r border-[#F1F5F9]">
            <span className="block text-[11px] text-[#166534]">Aktif</span>
            <span className="text-lg font-bold text-[#166534] font-mono">
              {stats.active}
            </span>
          </div>
          <div className="px-3 sm:px-4 py-1.5">
            <span className="block text-[11px] text-[#94A3B8]">Nonaktif</span>
            <span className="text-lg font-bold text-[#475569] font-mono">
              {stats.inactive}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-lg border border-[#CBD5E1] shadow-xs mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[220px] flex-1 md:max-w-xs">
            <span className="material-symbols-outlined text-[#94A3B8] text-[18px] absolute left-3 top-2.5 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, kode atau email..."
              className="w-full h-9 pl-9 pr-3 rounded bg-white border border-[#CBD5E1] text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>

          {/* Filter Dropdown: Peran */}
          <div className="w-36 sm:w-44">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full h-9 px-2.5 rounded bg-white border border-[#CBD5E1] text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <option value="">Semua Peran</option>
              <option value="INTAKE">INTAKE</option>
              <option value="FINANCE_REVIEWER">FINANCE_REVIEWER</option>
              <option value="SERVICE_LEAD">SERVICE_LEAD</option>
              <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
            </select>
          </div>

          {/* Filter Dropdown: Status */}
          <div className="w-32">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-9 px-2.5 rounded bg-white border border-[#CBD5E1] text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <option value="">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </select>
          </div>

          {/* Reset Filter Button */}
          {(search || roleFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setRoleFilter("");
                setStatusFilter("");
              }}
              className="h-9 px-2.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded text-xs transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">
                restart_alt
              </span>
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Primary Action: Tambah Pengguna */}
        <button
          type="button"
          onClick={() => {
            setFormName("");
            setFormEmail("");
            setFormRole("INTAKE");
            setIsAddModalOpen(true);
          }}
          className="h-9 px-4 bg-[#1E3A8A] hover:bg-[#1B3380] active:bg-[#172B6B] text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-2 shrink-0 shadow-xs cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>Tambah Pengguna</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-10 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                <th className="px-4 py-2 text-[11px] font-semibold uppercase text-[#475569] tracking-wider">
                  NAMA &amp; IDENTITAS
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase text-[#475569] tracking-wider">
                  EMAIL PENGGUNA
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase text-[#475569] tracking-wider">
                  PERAN
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase text-[#475569] tracking-wider">
                  STATUS AKSES
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase text-[#475569] tracking-wider">
                  PENUGASAN KLIEN
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase text-[#475569] tracking-wider text-right">
                  AKSI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#94A3B8]">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-[32px]">
                        search_off
                      </span>
                      <span>Tidak ada pengguna yang cocok dengan kriteria filter.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const initials = u.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();

                  const roleBadgeClass =
                    u.role === "SYSTEM_ADMIN"
                      ? "bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]"
                      : u.role === "FINANCE_REVIEWER"
                      ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
                      : u.role === "SERVICE_LEAD"
                      ? "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]"
                      : "bg-[#E0E7FF] text-[#1E3A8A] border-[#A5B4FC]";

                  return (
                    <tr
                      key={u.id}
                      className="h-12 hover:bg-[#F8FAFC] transition-colors group"
                    >
                      {/* Name & Identity */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#E0E7FF] text-[#1E3A8A] font-semibold text-xs flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0F172A] leading-tight">
                              {u.name}
                            </div>
                            <div className="text-[11px] font-mono text-[#94A3B8] leading-none mt-0.5">
                              {u.code}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email with copy button */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#475569]">{u.email}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyEmail(u.email)}
                            title={
                              copiedEmail === u.email
                                ? "Disalin!"
                                : "Salin Email"
                            }
                            className="text-[#94A3B8] hover:text-[#0F172A] p-0.5 rounded transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {copiedEmail === u.email ? "check" : "content_copy"}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${roleBadgeClass}`}
                        >
                          <span className="material-symbols-outlined text-[13px] mr-1">
                            badge
                          </span>
                          {u.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            u.status === "Aktif"
                              ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
                              : "bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px] mr-1">
                            {u.status === "Aktif"
                              ? "check_circle"
                              : "cancel"}
                          </span>
                          {u.status}
                        </span>
                      </td>

                      {/* Client assignments */}
                      <td className="px-4 py-2 text-[#475569]">
                        {u.clients}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="p-1 rounded text-[#475569] hover:bg-[#F1F5F9] hover:text-[#1E3A8A] transition-colors"
                            title="Edit Pengguna"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u.id)}
                            className={`p-1 rounded transition-colors ${
                              u.status === "Aktif"
                                ? "text-[#B91C1C] hover:bg-[#FEE2E2]"
                                : "text-[#166534] hover:bg-[#DCFCE7]"
                            }`}
                            title={
                              u.status === "Aktif"
                                ? "Nonaktifkan Akses"
                                : "Aktifkan Akses"
                            }
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {u.status === "Aktif"
                                ? "block"
                                : "check_circle"}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Pengguna */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#CBD5E1]">
              <h3 className="font-bold text-base text-[#0F172A]">
                Tambah Pengguna Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#94A3B8] hover:text-[#0F172A]"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB] outline-none"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Email Internal (@amiga.internal)
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contoh@amiga.internal"
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB] outline-none"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Peran Tunggal (ACC-02)
                </label>
                <select
                  value={formRole}
                  onChange={(e) =>
                    setFormRole(e.target.value as UserItem["role"])
                  }
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB] outline-none"
                >
                  <option value="INTAKE">INTAKE</option>
                  <option value="FINANCE_REVIEWER">FINANCE_REVIEWER</option>
                  <option value="SERVICE_LEAD">SERVICE_LEAD</option>
                  <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                </select>
                <span className="text-[11px] text-[#64748B] mt-1 block">
                  Setiap pengguna hanya boleh memiliki tepat satu peran di MVP.
                </span>
              </div>

              <div className="pt-3 border-t border-[#CBD5E1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded text-[#475569] hover:bg-[#F1F5F9] font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[#1E3A8A] text-white hover:bg-[#1B3380] font-semibold"
                >
                  Simpan Pengguna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Pengguna */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#CBD5E1]">
              <h3 className="font-bold text-base text-[#0F172A]">
                Edit Pengguna ({selectedUser?.code})
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-[#94A3B8] hover:text-[#0F172A]"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB] outline-none"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Email Internal
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB] outline-none"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Peran
                </label>
                <select
                  value={formRole}
                  onChange={(e) =>
                    setFormRole(e.target.value as UserItem["role"])
                  }
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB] outline-none"
                >
                  <option value="INTAKE">INTAKE</option>
                  <option value="FINANCE_REVIEWER">FINANCE_REVIEWER</option>
                  <option value="SERVICE_LEAD">SERVICE_LEAD</option>
                  <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#CBD5E1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded text-[#475569] hover:bg-[#F1F5F9] font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[#1E3A8A] text-white hover:bg-[#1B3380] font-semibold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

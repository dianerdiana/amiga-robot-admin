export type UserRoleType =
  | "SYSTEM_ADMIN"
  | "INTAKE"
  | "FINANCE_REVIEWER"
  | "SERVICE_LEAD"
  | "ROBOT_ADMIN"
  | string;

export interface MenuItem {
  id: string;
  title: string;
  icon: string;
  path: string;
  badge?: string;
  badgeColor?: string;
  description?: string;
}

export interface RoleConfig {
  role: UserRoleType;
  label: string;
  badgeLabel: string;
  badgeIcon: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  moduleTitle: string;
  scopeTitle: string;
  scopeDesc: string;
  menuItems: MenuItem[];
}

export const ROLE_CONFIGS: Record<string, RoleConfig> = {
  SYSTEM_ADMIN: {
    role: "SYSTEM_ADMIN",
    label: "System Admin",
    badgeLabel: "SYSTEM ADMIN",
    badgeIcon: "admin_panel_settings",
    badgeBg: "bg-[#EDE9FE]",
    badgeText: "text-[#5B21B6]",
    badgeBorder: "border-[#C4B5FD]",
    moduleTitle: "Modul Administrasi",
    scopeTitle: "Akses Terbatas",
    scopeDesc: "Khusus manajemen master data pengguna, konfigurasi klien, dan penugasan intake.",
    menuItems: [
      {
        id: "pengguna",
        title: "Pengguna",
        icon: "group",
        path: "/users",
        description: "Manajemen akun staf, peran tunggal, dan status aktif",
      },
      {
        id: "klien",
        title: "Klien",
        icon: "apartment",
        path: "/clients",
        description: "Kelola master data perusahaan klien",
      },
      {
        id: "penugasan-intake",
        title: "Penugasan Intake",
        icon: "assignment_ind",
        path: "/dashboard?tab=penugasan-intake",
        description: "Alokasi staf Intake ke klien terdaftar",
      },
      {
        id: "daftar-klien",
        title: "Daftar Klien",
        icon: "domain",
        path: "/dashboard?tab=daftar-klien",
        description: "Monitoring klien dan penetapan reviewer",
      },
    ],
  },
  INTAKE: {
    role: "INTAKE",
    label: "Intake Support",
    badgeLabel: "INTAKE",
    badgeIcon: "badge",
    badgeBg: "bg-[#E0E7FF]",
    badgeText: "text-[#1E3A8A]",
    badgeBorder: "border-[#A5B4FC]",
    moduleTitle: "Modul Intake",
    scopeTitle: "Alur Intake Internal",
    scopeDesc: "Unggah invoice klien, pantau proses ekstraksi AI, dan susun voucher pembayaran.",
    menuItems: [
      {
        id: "invoices",
        title: "Antrean",
        icon: "receipt_long",
        path: "/invoices",
        description: "Daftar dokumen invoice dan status ekstraksi AI",
      },
      {
        id: "upload",
        title: "Upload Invoice",
        icon: "upload_file",
        path: "/invoices/upload",
        description: "Form upload invoice PDF/JPG/PNG ke private S3",
      },
      {
        id: "vouchers",
        title: "Daftar Voucher",
        icon: "payments",
        path: "/dashboard?tab=vouchers",
        description: "Daftar voucher dibuat, siap dikirim & diunduh",
      },
      {
        id: "buat-voucher",
        title: "Buat Voucher",
        icon: "add_card",
        path: "/dashboard?tab=buat-voucher",
        description: "Pilih invoice AMIGA_REVIEWED dan buat voucher",
      },
    ],
  },
  FINANCE_REVIEWER: {
    role: "FINANCE_REVIEWER",
    label: "Finance Reviewer",
    badgeLabel: "FINANCE REVIEWER",
    badgeIcon: "verified",
    badgeBg: "bg-[#DCFCE7]",
    badgeText: "text-[#166534]",
    badgeBorder: "border-[#86EFAC]",
    moduleTitle: "Modul Finance Reviewer",
    scopeTitle: "Verifikasi Independen",
    scopeDesc: "Pemeriksaan dokumen split-screen, koreksi field, persetujuan atau penolakan invoice.",
    menuItems: [
      {
        id: "reviews",
        title: "Antrean Review",
        icon: "fact_check",
        path: "/dashboard",
        badge: "5 Siap",
        badgeColor: "bg-[#CCFBF1] text-[#115E59]",
        description: "Invoice lolos validasi otomatis yang butuh review",
      },
      {
        id: "riwayat",
        title: "Riwayat Review",
        icon: "history",
        path: "/dashboard?tab=riwayat",
        description: "Audit trail persetujuan dan penolakan sebelumnya",
      },
    ],
  },
  SERVICE_LEAD: {
    role: "SERVICE_LEAD",
    label: "Service Lead",
    badgeLabel: "SERVICE LEAD",
    badgeIcon: "supervisor_account",
    badgeBg: "bg-[#FEF3C7]",
    badgeText: "text-[#92400E]",
    badgeBorder: "border-[#FCD34D]",
    moduleTitle: "Modul Service Lead",
    scopeTitle: "Manajemen Layanan",
    scopeDesc: "Penetapan dan pencabutan reviewer per klien, serta pengawasan antrean klien.",
    menuItems: [
      {
        id: "penugasan-reviewer",
        title: "Penugasan Reviewer",
        icon: "manage_accounts",
        path: "/dashboard",
        description: "Alokasi satu atau lebih reviewer untuk tiap klien",
      },
      {
        id: "klien-reviewer",
        title: "Daftar Klien & Reviewer",
        icon: "domain_verification",
        path: "/dashboard?tab=klien-reviewer",
        badge: "1 Tanpa Reviewer",
        badgeColor: "bg-[#FEE2E2] text-[#991B1B]",
        description: "Deteksi klien tanpa reviewer aktif",
      },
    ],
  },
};

export const DEFAULT_ROLE_CONFIG = ROLE_CONFIGS.SYSTEM_ADMIN;

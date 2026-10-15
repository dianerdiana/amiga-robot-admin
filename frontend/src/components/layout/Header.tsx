"use client";

import React, { useState } from "react";
import { UserProfile } from "@/lib/api";
import { ROLE_CONFIGS, RoleConfig, UserRoleType } from "./types";

interface HeaderProps {
  user: UserProfile;
  currentRole: UserRoleType;
  onRoleChange?: (role: UserRoleType) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
}

export default function Header({
  user,
  currentRole,
  onRoleChange,
  isSidebarOpen,
  onToggleSidebar,
  onLogout,
}: HeaderProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const roleConfig: RoleConfig =
    ROLE_CONFIGS[currentRole] || ROLE_CONFIGS.SYSTEM_ADMIN;

  const getInitials = (name: string) => {
    if (!name) return "AM";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-white z-50 border-b border-[#CBD5E1] shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="w-full h-14 px-3 sm:px-6 flex items-center justify-between">
        {/* Left Section: Sidenav Toggle Button + Brand Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle Sidenav Button */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isSidebarOpen ? "Sembunyikan Sidenav" : "Tampilkan Sidenav"}
            title={isSidebarOpen ? "Sembunyikan Sidenav" : "Tampilkan Sidenav"}
            className="p-2 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isSidebarOpen ? "menu_open" : "menu"}
            </span>
          </button>

          {/* AMIGA Robot Admin Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#1E3A8A] flex items-center justify-center text-white shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[20px] text-white">
                smart_toy
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[15px] tracking-tight text-[#0F172A] leading-none">
                AMIGA
              </span>
              <span className="text-[10px] text-[#475569] leading-none mt-1 uppercase tracking-wider font-semibold">
                Robot Admin
              </span>
            </div>
          </div>
        </div>

        {/* Right Section: Role Badge, Role Simulator, Notifications, User Profile */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Role Badge with Dropdown Switcher for Testing */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${roleConfig.badgeBg} ${roleConfig.badgeText} border ${roleConfig.badgeBorder} text-xs font-semibold tracking-wide transition-all hover:opacity-90 cursor-pointer shadow-xs`}
              title="Klik untuk mensimulasikan tampilan peran lain"
            >
              <span className="material-symbols-outlined text-[15px]">
                {roleConfig.badgeIcon}
              </span>
              <span className="hidden md:inline">{roleConfig.badgeLabel}</span>
              <span className="material-symbols-outlined text-[14px] opacity-70">
                arrow_drop_down
              </span>
            </button>

            {/* Role Simulator Menu Dropdown */}
            {showRoleMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowRoleMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-lg border border-[#CBD5E1] shadow-lg py-1.5 z-50 text-xs">
                  <div className="px-3 py-1.5 border-b border-[#F1F5F9] text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
                    Simulasi Sidenav Berdasarkan Peran:
                  </div>
                  {Object.values(ROLE_CONFIGS).map((cfg) => (
                    <button
                      key={cfg.role}
                      type="button"
                      onClick={() => {
                        onRoleChange?.(cfg.role);
                        setShowRoleMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#F1F5F9] transition-colors ${
                        currentRole === cfg.role
                          ? "bg-[#E0E7FF] text-[#1E3A8A] font-semibold"
                          : "text-[#0F172A]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">
                          {cfg.badgeIcon}
                        </span>
                        <span>{cfg.badgeLabel}</span>
                      </div>
                      {currentRole === cfg.role && (
                        <span className="material-symbols-outlined text-[16px] text-[#1E3A8A]">
                          check
                        </span>
                      )}
                    </button>
                  ))}
                  {user.role !== currentRole && (
                    <div className="px-3 pt-1 border-t border-[#F1F5F9] mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onRoleChange?.(user.role);
                          setShowRoleMenu(false);
                        }}
                        className="text-[11px] text-[#1E40AF] hover:underline"
                      >
                        Reset ke Peran Akun ({user.role})
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Notifications Button */}
          <button
            type="button"
            aria-label="Notifikasi"
            className="relative p-2 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              notifications
            </span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#B91C1C]"></span>
          </button>

          {/* Divider */}
          <div className="h-6 w-px bg-[#E2E8F0] mx-0.5 sm:mx-1"></div>

          {/* User Profile Pill / Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors text-left"
            >
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-[#0F172A] leading-tight">
                  {user.name}
                </div>
                <div className="text-[11px] text-[#475569] leading-tight font-mono">
                  {user.email}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center font-semibold text-xs shrink-0 shadow-xs">
                {getInitials(user.name)}
              </div>
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowProfileMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-lg border border-[#CBD5E1] shadow-lg py-2 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-[#F1F5F9]">
                    <div className="font-semibold text-[#0F172A]">{user.name}</div>
                    <div className="text-[11px] text-[#475569] truncate">
                      {user.email}
                    </div>
                    <div className="mt-1 inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1]">
                      Role: {user.role}
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-2 text-[#991B1B] hover:bg-[#FEE2E2] flex items-center gap-2 font-medium transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        logout
                      </span>
                      <span>Keluar dari Sesi</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

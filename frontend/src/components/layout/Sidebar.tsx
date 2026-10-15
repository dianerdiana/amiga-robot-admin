"use client";

import React from "react";
import { ROLE_CONFIGS, RoleConfig, UserRoleType } from "./types";

interface SidebarProps {
  currentRole: UserRoleType;
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onLogout: () => void;
}

export default function Sidebar({
  currentRole,
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  onLogout,
}: SidebarProps) {
  const roleConfig: RoleConfig =
    ROLE_CONFIGS[currentRole] || ROLE_CONFIGS.SYSTEM_ADMIN;

  return (
    <>
      {/* Mobile Backdrop Overlay (only shown when sidebar is open on small screens) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-xs z-30 lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidenav Aside Container */}
      <aside
        className={`fixed left-0 top-14 bottom-0 w-60 bg-white z-40 border-r border-[#CBD5E1] shadow-[0_1px_8px_rgba(0,0,0,0.04)] flex flex-col justify-between py-4 transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigasi Utama"
      >
        {/* Top: Module Header & Navigation Menu */}
        <div className="flex flex-col">
          {/* Header Title of Module */}
          <div className="px-4 mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              {roleConfig.moduleTitle}
            </span>
            {/* Quick close button on mobile */}
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1 rounded hover:bg-[#F1F5F9] text-[#475569]"
              title="Tutup Menu"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 px-3">
            {roleConfig.menuItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-colors text-left ${
                    isActive
                      ? "bg-[#1E3A8A] text-white font-semibold shadow-xs"
                      : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-medium"
                  }`}
                  title={item.description}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`material-symbols-outlined text-[20px] shrink-0 ${
                        isActive ? "text-white" : "text-[#475569]"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-white/20 text-white"
                          : item.badgeColor || "bg-[#DBEAFE] text-[#1E40AF]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Scope Callout, Sidenav Collapse/Hide Button, and Logout */}
        <div className="px-3 flex flex-col gap-2">
          {/* Persona Scope Box (PRD Compliance) */}
          <div className="p-3 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0]">
            <div className="flex items-center gap-1.5 text-[#334155] font-semibold text-xs mb-1">
              <span className="material-symbols-outlined text-[16px] text-[#166534]">
                verified_user
              </span>
              <span>{roleConfig.scopeTitle}</span>
            </div>
            <p className="text-[11px] text-[#475569] leading-snug">
              {roleConfig.scopeDesc}
            </p>
          </div>

          {/* Dedicated Button to Hide/Collapse Sidenav */}
          <button
            type="button"
            onClick={onClose}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-colors text-xs font-medium border border-dashed border-[#CBD5E1]"
            title="Sembunyikan Sidenav"
          >
            <span className="material-symbols-outlined text-[18px]">
              keyboard_double_arrow_left
            </span>
            <span>Sembunyikan Sidenav</span>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#B91C1C] hover:bg-[#FEE2E2] hover:text-[#991B1B] transition-colors text-xs font-medium"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
}

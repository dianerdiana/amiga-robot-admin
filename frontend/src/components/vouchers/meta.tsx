import { VoucherStatus } from "@/lib/api";

export const VOUCHER_STATUS: Record<VoucherStatus, { label: string; icon: string; className: string }> = {
  CREATED: {
    label: "CREATED",
    icon: "description",
    className: "border-status-vouchered-border bg-status-vouchered-bg text-status-vouchered-fg",
  },
  SENT_TO_CLIENT: {
    label: "SENT TO CLIENT",
    icon: "send",
    className: "border-status-sent-border bg-status-sent-bg text-status-sent-fg",
  },
};

export function VoucherStatusChip({ status }: { status: VoucherStatus }) {
  const meta = VOUCHER_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

import { VoucherSigner } from "@/lib/api";

const PER_ROW = 3;

/**
 * Signature section of the voucher paper, mirroring `signature_rows` in backend/services/voucher_pdf.py:
 * one approver sits on the submitter's row (left and right); more approvers go below the submitter,
 * three per row, with a short last row centered.
 */
export default function SignatureBlock({ submitter, approvers }: { submitter: VoucherSigner; approvers: VoucherSigner[] }) {
  if (approvers.length <= 1) {
    return (
      <div className="mt-8 flex justify-between">
        <Signature label="Diajukan oleh" signer={submitter} />
        {approvers[0] && <Signature label="Disetujui oleh" signer={approvers[0]} />}
      </div>
    );
  }
  return (
    <div className="mt-8 flex flex-col gap-5">
      <div className="flex justify-center">
        <Signature label="Diajukan oleh" signer={submitter} />
      </div>
      <div className="flex flex-wrap justify-center gap-y-5">
        {approvers.map((approver, index) => (
          <Signature key={index} label="Disetujui oleh" signer={approver} />
        ))}
      </div>
    </div>
  );
}

function Signature({ label, signer }: { label: string; signer: VoucherSigner }) {
  return (
    <div className="flex basis-1/3 flex-col items-center px-2 text-center text-[11px]" style={{ maxWidth: `${100 / PER_ROW}%` }}>
      <p className="text-text-secondary">{label}</p>
      <div className="h-14" aria-hidden="true" />
      <p className="w-full border-b border-text-primary pb-0.5 font-semibold text-text-primary">{signer.name || "-"}</p>
      <p className="mt-0.5 text-text-secondary">{signer.role || "-"}</p>
    </div>
  );
}

import { Headphones, Mail, Phone, X } from "lucide-react";
import React, { useEffect } from "react";

interface TechnicalSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TechnicalSupportModal({
  isOpen,
  onClose,
}: TechnicalSupportModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="rounded-xl bg-emerald-50 p-2 text-[#00843D]">
              <Headphones />
            </span>
            <div>
              <h2
                id="support-title"
                className="text-lg font-semibold text-slate-900"
              >
                MoA ICT Technical Support
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Account access, password and system assistance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close technical support"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <a
            href="tel:+251116462199"
            className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-emerald-600 transition-colors"
          >
            <Phone size={20} className="text-emerald-700" />
            <span>
              <span className="block text-xs font-semibold uppercase text-slate-500">
                Phone
              </span>
              <span className="font-medium text-slate-900">
                +251 11646 21 99
              </span>
            </span>
          </a>
          <a
            href="mailto:info@moa.gov.et"
            className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-emerald-600 transition-colors"
          >
            <Mail size={20} className="text-emerald-700" />
            <span>
              <span className="block text-xs font-semibold uppercase text-slate-500">
                Support email
              </span>
              <span className="font-medium text-slate-900">
                info@moa.gov.et
              </span>
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}

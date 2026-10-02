import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Width class — defaults to lg */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'lg',
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  // Set once the user types or picks anything inside, so an accidental close can't discard it
  const edited = useRef(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    if (isOpen) {
      edited.current = false;
      setConfirmingClose(false);
    }
  }, [isOpen]);

  /** Escape, the X and a click outside all come here: ask first when something was typed */
  const requestClose = useCallback(() => {
    if (edited.current) setConfirmingClose(true);
    else onClose();
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmingClose) setConfirmingClose(false);
      else requestClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, requestClose, confirmingClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // A click outside never discards typed data; it only closes an untouched window
    if (e.target === overlayRef.current && !edited.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onInput={() => { edited.current = true; }}
        onChange={() => { edited.current = true; }}
        className={`
          relative w-full ${SIZE_CLASS[size]} max-h-[90vh] flex flex-col
          bg-white rounded-2xl shadow-2xl
          overflow-hidden
        `}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0 ml-4"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>

        {confirmingClose && (
          <div role="alertdialog" aria-label="Discard what you entered?" className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 p-6 backdrop-blur-[2px]">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <h3 className="text-sm font-extrabold text-slate-900">Discard what you entered?</h3>
              <p className="mt-1 text-xs text-slate-600">Nothing has been saved yet. If you close this window, what you typed is lost.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmingClose(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800 cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

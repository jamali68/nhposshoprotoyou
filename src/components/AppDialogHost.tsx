/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'primary';

export interface AppConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

interface ActiveConfirm extends AppConfirmOptions {
  resolve: (result: boolean) => void;
}

interface ActiveToast {
  id: number;
  message: string;
  tone: 'error' | 'info' | 'success';
}

type ConfirmListener = (req: ActiveConfirm) => void;
type ToastListener = (toast: ActiveToast) => void;

const confirmListeners = new Set<ConfirmListener>();
const toastListeners = new Set<ToastListener>();
let toastCounter = 0;

/**
 * Displays a mobile-friendly in-app alert toast (replaces native window.alert).
 */
export function showAppAlert(
  message: string,
  tone: 'error' | 'info' | 'success' = 'error'
): void {
  const toast: ActiveToast = {
    id: ++toastCounter,
    message,
    tone
  };
  toastListeners.forEach(fn => fn(toast));
}

/**
 * Displays an in-app confirmation modal and resolves to true/false (replaces native window.confirm).
 */
export function showAppConfirm(options: string | AppConfirmOptions): Promise<boolean> {
  const normalized: AppConfirmOptions =
    typeof options === 'string' ? { message: options } : options;

  return new Promise<boolean>(resolve => {
    if (confirmListeners.size === 0) {
      resolve(false);
      return;
    }
    const req: ActiveConfirm = {
      title: normalized.title || 'Confirm Action',
      message: normalized.message,
      confirmText: normalized.confirmText || 'Confirm',
      cancelText: normalized.cancelText || 'Cancel',
      variant: normalized.variant || 'primary',
      resolve
    };
    confirmListeners.forEach(fn => fn(req));
  });
}

export const AppDialogHost: React.FC = () => {
  const [confirmQueue, setConfirmQueue] = useState<ActiveConfirm[]>([]);
  const [toast, setToast] = useState<ActiveToast | null>(null);

  useEffect(() => {
    const onConfirm: ConfirmListener = req => {
      setConfirmQueue(prev => [...prev, req]);
    };
    const onToast: ToastListener = t => {
      setToast(t);
    };

    confirmListeners.add(onConfirm);
    toastListeners.add(onToast);
    return () => {
      confirmListeners.delete(onConfirm);
      toastListeners.delete(onToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(current => (current?.id === toast.id ? null : current));
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeConfirm = confirmQueue[0] || null;

  const handleCloseConfirm = (accepted: boolean) => {
    if (!activeConfirm) return;
    const current = activeConfirm;
    setConfirmQueue(prev => prev.slice(1));
    current.resolve(accepted);
  };

  useEffect(() => {
    if (!activeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeConfirm]);

  return (
    <>
      {/* In-App Alert Toast */}
      {toast && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[92%] max-w-md animate-in fade-in slide-in-from-top-3 duration-150"
        >
          <div
            className={`rounded-2xl px-4 py-3 shadow-2xl border flex items-start gap-3 text-xs font-bold backdrop-blur-md ${
              toast.tone === 'error'
                ? 'bg-rose-950/95 border-rose-500/50 text-rose-50'
                : toast.tone === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-50'
                : 'bg-slate-900/95 border-slate-700 text-slate-100'
            }`}
          >
            {toast.tone === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : toast.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-0.5 rounded-lg opacity-75 hover:opacity-100 transition-opacity"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal */}
      {activeConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => handleCloseConfirm(false)}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  activeConfirm.variant === 'danger'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {activeConfirm.variant === 'danger' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-slate-900">
                  {activeConfirm.title}
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                  {activeConfirm.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleCloseConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {activeConfirm.cancelText}
              </button>
              <button
                type="button"
                onClick={() => handleCloseConfirm(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
                  activeConfirm.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {activeConfirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

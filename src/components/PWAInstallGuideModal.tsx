/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Smartphone, X, Share2, PlusSquare } from 'lucide-react';

interface PWAInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNativeInstall?: () => Promise<boolean>;
  canNativeInstall?: boolean;
}

export const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  isOpen,
  onClose,
  onNativeInstall,
  canNativeInstall
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
        <div className="bg-[#1b263b] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h3 className="font-black text-sm">فون یا کمپیوٹر میں ایپ انسٹال کریں</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-700">
          {canNativeInstall && onNativeInstall && (
            <button
              type="button"
              onClick={async () => {
                const ok = await onNativeInstall();
                if (ok) onClose();
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Install NH POS Shop Now</span>
            </button>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-left">
            <div className="font-black text-slate-900">Android / Chrome:</div>
            <p className="text-[11px] leading-relaxed">
              اوپر دائیں کونے میں 3 نقطوں (⋮) والے مینو پر کلک کریں اور <strong>&ldquo;Install app&rdquo;</strong> یا <strong>&ldquo;Add to Home screen&rdquo;</strong> منتخب کریں۔
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-left">
            <div className="font-black text-slate-900 flex items-center gap-1.5">
              <span>iPhone / Safari:</span>
              <Share2 className="w-3.5 h-3.5 text-blue-600" />
              <PlusSquare className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <p className="text-[11px] leading-relaxed">
              نیچے <strong>Share</strong> بٹن پر ٹیپ کریں اور <strong>&ldquo;Add to Home Screen&rdquo;</strong> منتخب کریں۔
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
          >
            ٹھیک ہے (Close)
          </button>
        </div>
      </div>
    </div>
  );
};

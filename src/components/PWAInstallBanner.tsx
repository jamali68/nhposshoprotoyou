/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, X } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const PWAInstallBanner: React.FC = () => {
  const { isAppInstalled, showTopInstallBanner, setShowTopInstallBanner, installApp } = usePOS();

  if (isAppInstalled || !showTopInstallBanner) return null;

  return (
    <div className="fixed bottom-3 right-3 z-40 max-w-xs bg-[#1b263b] text-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-3 text-xs">
      <button
        type="button"
        onClick={() => installApp()}
        className="flex items-center gap-2 font-bold text-emerald-300 hover:text-emerald-200 cursor-pointer"
      >
        <Download className="w-4 h-4 animate-bounce" />
        <span>Install NH POS App</span>
      </button>
      <button
        type="button"
        onClick={() => setShowTopInstallBanner(false)}
        className="text-slate-400 hover:text-white p-1 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

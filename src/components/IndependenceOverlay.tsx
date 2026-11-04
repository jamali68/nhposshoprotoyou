/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Flag, X, Sparkles } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const IndependenceOverlay: React.FC = () => {
  const { showIndependenceModal, setShowIndependenceModal } = usePOS();

  if (!showIndependenceModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-emerald-400/40 relative space-y-4">
        <button
          type="button"
          onClick={() => setShowIndependenceModal(false)}
          className="absolute top-4 right-4 text-emerald-200 hover:text-white p-1 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto">
          <Flag className="w-8 h-8 text-emerald-300" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-bold text-amber-300">
          <Sparkles className="w-3.5 h-3.5" />
          <span>پاکستان زندہ باد • جشنِ آزادی مبارک</span>
        </div>
        <h3 className="text-xl font-black">Happy Independence Day! 🇵🇰</h3>
        <p className="text-xs text-emerald-100 leading-relaxed">
          NH POS Shop کی جانب سے تمام دکانداروں اور صارفین کو جشنِ آزادی دل کی گہرائیوں سے مبارک ہو۔
        </p>
        <button
          type="button"
          onClick={() => setShowIndependenceModal(false)}
          className="w-full py-3 bg-white text-emerald-900 hover:bg-emerald-50 font-black rounded-xl text-xs shadow-lg cursor-pointer"
        >
          پاکستان پائندہ باد
        </button>
      </div>
    </div>
  );
};

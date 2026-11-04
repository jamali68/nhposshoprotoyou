/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trash2, RotateCcw, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const DeletedHistoryView: React.FC = () => {
  const { deletedHistory, restoreDeletedEntry, permanentDeleteEntry, goBack } = usePOS();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center gap-2.5">
        <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Deleted Logs / Trash (ڈیلیٹ شدہ ریکارڈز)</span>
          </h2>
          <p className="text-[11px] text-slate-500">Restore or permanently delete records</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {deletedHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">Trash bin is empty.</div>
        ) : (
          deletedHistory.map(item => (
            <div key={item.id} className="p-4 flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-black text-slate-900">{item.note}</span>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {item.source} • {item.transaction_date} • Deleted by {item.deleted_by}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm">Rs. {item.amount.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => restoreDeletedEntry(item.id)}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
                <button
                  type="button"
                  onClick={() => permanentDeleteEntry(item.id)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

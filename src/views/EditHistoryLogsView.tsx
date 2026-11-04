/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { History, CheckCheck, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const EditHistoryLogsView: React.FC = () => {
  const { editHistory, markAllEditsAsRead, goBack } = usePOS();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
              <History className="w-4 h-4 text-amber-600" />
              <span>Edit History Logs (تبدیل شدہ ریکارڈز)</span>
            </h2>
            <p className="text-[11px] text-slate-500">Audit trail of modified transactions</p>
          </div>
        </div>
        {editHistory.length > 0 && (
          <button
            type="button"
            onClick={markAllEditsAsRead}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All Read</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {editHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No edit history logs recorded yet.</div>
        ) : (
          editHistory.map(log => (
            <div key={log.id} className="p-4 flex items-center justify-between text-xs">
              <div>
                <div className="font-black text-slate-900">{log.note}</div>
                <div className="text-[10px] text-slate-500">
                  Edited by {log.edited_by} • {log.transaction_date}
                </div>
              </div>
              <div className="font-mono text-right">
                <div className="text-rose-600 line-through text-[11px]">Rs. {log.old_amount.toLocaleString()}</div>
                <div className="font-black text-emerald-700 text-sm">Rs. {log.new_amount.toLocaleString()}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

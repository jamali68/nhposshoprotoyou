/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ArrowLeft, CheckCheck } from 'lucide-react';
import { usePOS } from '../context/POSContext';

const formatEditTimestamp = (isoString: string): string => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const datePart = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `${datePart}, ${timePart}`;
};

const parseEditorInfo = (editedBy?: string): { isAdmin: boolean; badgeLabel: string; subLabel?: string } => {
  const raw = (editedBy || 'User').trim();
  const lower = raw.toLowerCase();
  const isAdmin = lower.includes('admin') || lower.includes('owner');

  // Extract optional name inside parentheses e.g. "Admin (Jam Imtiaz)"
  const parenMatch = raw.match(/\(([^)]+)\)/);
  const extractedName = parenMatch ? parenMatch[1].trim() : '';

  if (isAdmin) {
    return {
      isAdmin: true,
      badgeLabel: 'Admin',
      subLabel: extractedName || undefined
    };
  }

  // If staff/user has parentheses or a long name, keep badge compact
  if (extractedName) {
    const prefix = raw.split('(')[0].trim() || 'User';
    return {
      isAdmin: false,
      badgeLabel: prefix.length <= 8 ? prefix : 'User',
      subLabel: extractedName
    };
  }

  if (raw.length > 9) {
    return {
      isAdmin: false,
      badgeLabel: 'User',
      subLabel: raw
    };
  }

  return {
    isAdmin: false,
    badgeLabel: raw || 'User'
  };
};

export const EditHistoryLogsView: React.FC = () => {
  const {
    editHistory,
    markAllEditsAsRead,
    goBack
  } = usePOS();

  const sortedLogs = useMemo(() => {
    return [...editHistory].sort(
      (a, b) => new Date(b.edited_at).getTime() - new Date(a.edited_at).getTime()
    );
  }, [editHistory]);

  return (
    <div className="space-y-3.5 pb-12">
      {/* Top Action Header */}
      <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2c3e50] hover:bg-slate-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition-all shrink-0 shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Wapas</span>
        </button>

        <h2 className="text-base sm:text-lg font-black text-slate-800 text-center tracking-tight truncate">
          Edit History Logs
        </h2>

        <button
          type="button"
          onClick={markAllEditsAsRead}
          className="flex items-center gap-1 px-3.5 py-2 bg-[#27ae60] hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-extrabold transition-all shrink-0 shadow-2xs"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Read Clear</span>
        </button>
      </div>

      {/* 3-Column Logs Table Card */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-4 shadow-xs border border-slate-200/80 overflow-hidden">
        {/* Table Column Headers */}
        <div className="grid grid-cols-[1.45fr_1fr_76px] sm:grid-cols-[1.6fr_1fr_96px] items-center gap-2.5 bg-slate-50/95 border-b border-slate-200/70 px-3 py-2.5 rounded-t-xl text-[11.5px] sm:text-xs font-extrabold text-slate-600">
          <div>Detail / Date</div>
          <div>
            <span className="block leading-tight">Tabdeeli</span>
            <span className="block leading-tight text-[10.5px] sm:text-xs font-bold text-slate-500">(Amount)</span>
          </div>
          <div className="text-center leading-tight">Kis ne ki?</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-slate-100">
          {sortedLogs.length > 0 ? (
            sortedLogs.map(log => {
              const editor = parseEditorInfo(log.edited_by);
              const txDate =
                log.transaction_date ||
                (log.edited_at ? new Date(log.edited_at).toISOString().slice(0, 10) : '');

              return (
                <div
                  key={log.id}
                  className={`grid grid-cols-[1.45fr_1fr_76px] sm:grid-cols-[1.6fr_1fr_96px] items-center gap-2.5 px-3 py-3.5 transition-colors ${
                    !log.is_read ? 'bg-rose-50/45' : 'bg-white hover:bg-slate-50/50'
                  }`}
                >
                  {/* Column 1: Full Detail & Dates */}
                  <div className="min-w-0 pr-1 space-y-0.5">
                    <div className="text-slate-800 text-[13.5px] sm:text-sm font-extrabold leading-snug break-words whitespace-pre-wrap">
                      {log.note || 'No Note / General'}
                    </div>

                    {txDate && (
                      <div className="text-[11px] font-medium text-slate-500 leading-tight pt-0.5">
                        Date: {txDate}
                      </div>
                    )}

                    <div className="text-[10.5px] font-medium text-slate-400 leading-tight">
                      {formatEditTimestamp(log.edited_at)}
                    </div>
                  </div>

                  {/* Column 2: Stacked Old Amount (Strikethrough) -> New Amount */}
                  <div className="min-w-0 flex flex-col items-start justify-center">
                    <div className="flex items-center gap-1 text-xs font-bold leading-tight flex-wrap">
                      <span className="line-through decoration-rose-500 decoration-[1.5px] text-rose-500 font-mono">
                        {Number(log.old_amount || 0).toLocaleString()}
                      </span>
                      <span className="text-slate-400 text-xs font-normal leading-none">→</span>
                    </div>

                    <div className="text-emerald-600 font-mono font-black text-[13.5px] sm:text-sm leading-tight mt-0.5">
                      {Number(log.new_amount || 0).toLocaleString()}
                    </div>
                  </div>

                  {/* Column 3: Compact Editor Badge */}
                  <div className="flex flex-col items-center justify-center text-center">
                    <span
                      className={`inline-flex items-center justify-center text-[11px] font-extrabold px-2.5 py-1 rounded-md text-white shadow-2xs leading-none tracking-wide ${
                        editor.isAdmin ? 'bg-[#2ecc71]' : 'bg-[#34495e]'
                      }`}
                    >
                      {editor.badgeLabel}
                    </span>
                    {editor.subLabel && (
                      <span
                        className="text-[9px] font-semibold text-slate-400 mt-1 leading-tight max-w-[74px] sm:max-w-[92px] truncate"
                        title={editor.subLabel}
                      >
                        {editor.subLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              Koi edit history mojood nahi hai.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


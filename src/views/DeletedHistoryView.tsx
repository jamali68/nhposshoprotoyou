/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, RotateCcw, Trash2, History, AlertTriangle, Calendar } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { showAppConfirm } from '../components/AppDialogHost';
import { DeletedHistoryRecord } from '../types/pos';

export const DeletedHistoryView: React.FC = () => {
  const {
    deletedHistory,
    restoreDeletedEntry,
    permanentDeleteEntry,
    setActiveView,
    goBack
  } = usePOS();

  const [restoreTarget, setRestoreTarget] = useState<DeletedHistoryRecord | null>(null);
  const [restoreDate, setRestoreDate] = useState<string>('');

  const openRestoreModal = (item: DeletedHistoryRecord) => {
    setRestoreTarget(item);
    setRestoreDate(item.transaction_date || new Date().toISOString().split('T')[0]);
  };

  const handleConfirmRestore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreTarget) return;
    const finalDate =
      restoreDate && /^\d{4}-\d{2}-\d{2}$/.test(restoreDate)
        ? restoreDate
        : restoreTarget.transaction_date;
    restoreDeletedEntry(restoreTarget.id, finalDate);
    setRestoreTarget(null);
  };

  const handlePermanentDelete = async (id: string) => {
    const confirmed = await showAppConfirm({
      title: 'Permanent Delete',
      message: 'Permanently delete this entry? This action cannot be undone.',
      confirmText: 'Delete Forever',
      variant: 'danger'
    });
    if (confirmed) {
      permanentDeleteEntry(id);
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'wholesaler_khata':
        return <span className="bg-[#d35400] text-white px-2 py-0.5 rounded text-[9px] font-bold">WHOLESALER</span>;
      case 'customer_khata':
        return <span className="bg-[#8e44ad] text-white px-2 py-0.5 rounded text-[9px] font-bold">CUSTOMER</span>;
      case 'shop_cash':
        return <span className="bg-[#27ae60] text-white px-2 py-0.5 rounded text-[9px] font-bold">SHOP CASH</span>;
      case 'back_cash':
        return <span className="bg-[#2980b9] text-white px-2 py-0.5 rounded text-[9px] font-bold">BACK CASH</span>;
      default:
        return <span className="bg-slate-500 text-white px-2 py-0.5 rounded text-[9px] font-bold">LOG</span>;
    }
  };

  const sortedDeletedHistory = React.useMemo(() => {
    return [...deletedHistory].sort((a, b) => {
      const timeA = a.deleted_at ? new Date(a.deleted_at).getTime() : 0;
      const timeB = b.deleted_at ? new Date(b.deleted_at).getTime() : 0;
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeB !== timeA) {
        return timeB - timeA;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }, [deletedHistory]);

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2c3e50] hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base sm:text-lg font-black text-slate-800 text-center tracking-tight flex items-center gap-1.5">
          <History className="w-4 h-4 text-slate-500" />
          <span>Deleted Logs (90 Days)</span>
        </h2>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setActiveView('daily_cash')}
            className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
          >
            Shop
          </button>
          <button
            type="button"
            onClick={() => setActiveView('back_cash')}
            className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold"
          >
            Back
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>Note: Latest deleted entries top par aur older entries neechay show hoti hain (90 days auto-clean).</span>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
        <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
          <span>Deleted Items Log (Latest First)</span>
          <span>{sortedDeletedHistory.length} records</span>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedDeletedHistory.length > 0 ? (
            sortedDeletedHistory.map(item => (
              <div key={item.id} className="py-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">
                      {item.type}
                    </span>
                    {getSourceBadge(item.source)}
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded text-white ${
                        item.deleted_by === 'admin' ? 'bg-rose-600' : 'bg-slate-700'
                      }`}
                    >
                      {item.deleted_by.toUpperCase()}
                    </span>
                  </div>

                  <b className="text-slate-800 text-[13px] block">{item.note || 'No Description'}</b>

                  <div className="text-[11px] text-slate-400 space-x-2">
                    <span>Orig. Date: {item.transaction_date}</span>
                    <span>•</span>
                    <span className="text-orange-600 font-medium">
                      Deleted: {new Date(item.deleted_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => openRestoreModal(item)}
                      className="px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 border border-emerald-600 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePermanentDelete(item.id)}
                      className="px-2.5 py-1 text-rose-700 hover:bg-rose-50 border border-rose-600 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Permanent Delete</span>
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-black font-mono text-slate-900">
                    Rs. {item.amount.toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs space-y-1">
              <History className="w-6 h-6 mx-auto opacity-30" />
              <p>Koi delete record maujood nahi hai.</p>
            </div>
          )}
        </div>
      </div>

      {/* Restore Entry Modal with Date Selector */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white text-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-100 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-emerald-600" />
                <span>Restore Entry (ریکارڈ بحال کریں)</span>
              </h3>
              {getSourceBadge(restoreTarget.source)}
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-700 truncate">
                  {restoreTarget.note || 'No Description'}
                </span>
                <span className="font-black font-mono text-emerald-700 shrink-0">
                  Rs. {restoreTarget.amount.toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Original Date: <b className="text-slate-700">{restoreTarget.transaction_date}</b>
              </div>
            </div>

            <form onSubmit={handleConfirmRestore} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Restore Date (تاریخ منتخب کریں)</span>
                  </label>
                  {restoreDate !== restoreTarget.transaction_date && (
                    <button
                      type="button"
                      onClick={() => setRestoreDate(restoreTarget.transaction_date)}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Asal Date ({restoreTarget.transaction_date})
                    </button>
                  )}
                </div>

                <input
                  type="date"
                  value={restoreDate}
                  onChange={e => setRestoreDate(e.target.value)}
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                />

                {restoreDate === restoreTarget.transaction_date ? (
                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                    ✓ Ye entry apni asal date ({restoreTarget.transaction_date}) mein wapas restore hogi.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    📅 Nayi Date Set: Ye entry ab <b>{restoreDate}</b> ki date mein restore hogi.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRestoreTarget(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

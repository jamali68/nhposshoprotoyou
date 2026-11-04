/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Wallet, Plus, Trash2, Edit2, ArrowLeft, Check, X } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const DailyCashView: React.FC = () => {
  const {
    filterDate,
    setFilterDate,
    dailyTransactions,
    addDailyTransaction,
    updateDailyTransaction,
    deleteDailyTransaction,
    getShopCashStats,
    goBack
  } = usePOS();

  const [type, setType] = useState<'opening' | 'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const stats = getShopCashStats(filterDate);
  const txs = dailyTransactions.filter(t => t.transaction_date === filterDate);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) return;
    addDailyTransaction({
      type,
      amount: num,
      description: description.trim() || (type === 'opening' ? 'Opening Balance' : type === 'in' ? 'Cash In' : 'Cash Out'),
      transaction_date: filterDate
    });
    setAmount('');
    setDescription('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-blue-600" />
              <span>Daily Cash Book (روزانہ کیش بک)</span>
            </h2>
            <p className="text-[11px] text-slate-500">Opening, Cash In & Cash Out Ledger</p>
          </div>
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        />
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Opening</span>
          <div className="text-base font-black text-slate-900 font-mono">Rs. {stats.opening.toLocaleString()}</div>
        </div>
        <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">
          <span className="text-[10px] font-bold text-emerald-700 uppercase">Cash In (+)</span>
          <div className="text-base font-black text-emerald-800 font-mono">Rs. {stats.cashIn.toLocaleString()}</div>
        </div>
        <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200">
          <span className="text-[10px] font-bold text-rose-700 uppercase">Cash Out (-)</span>
          <div className="text-base font-black text-rose-800 font-mono">Rs. {stats.cashOut.toLocaleString()}</div>
        </div>
        <div className="bg-blue-600 text-white p-3.5 rounded-2xl shadow-xs">
          <span className="text-[10px] font-bold text-blue-100 uppercase">Net Galla Balance</span>
          <div className="text-base font-black font-mono">Rs. {stats.balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Add Form */}
      <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <div className="grid grid-cols-3 gap-2">
          {(['in', 'out', 'opening'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`py-2 rounded-xl font-black uppercase cursor-pointer border ${
                type === t
                  ? t === 'in'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : t === 'out'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {t === 'in' ? '+ Cash In' : t === 'out' ? '- Cash Out' : 'Opening Cash'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="number"
            required
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Amount (رقم)"
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-sm"
          />
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description / تفصیل درج کریں"
            className="sm:col-span-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>ریکارڈ محفوظ کریں (Add Entry)</span>
        </button>
      </form>

      {/* Transactions List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-black text-xs text-slate-700">
          Transactions ({txs.length})
        </div>
        <div className="divide-y divide-slate-100">
          {txs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">اس تاریخ کا کوئی ریکارڈ موجود نہیں ہے۔</div>
          ) : (
            txs.map(tx => (
              <div key={tx.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                {editingId === tx.id ? (
                  <div className="flex-1 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      className="w-28 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        updateDailyTransaction(tx.id, Number(editAmount) || tx.amount, editDesc);
                        setEditingId(null);
                      }}
                      className="p-1.5 bg-emerald-600 text-white rounded-lg cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1.5 bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase mr-2 ${
                          tx.type === 'in'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tx.type === 'out'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {tx.type}
                      </span>
                      <span className="font-bold text-slate-900">{tx.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black font-mono text-sm text-slate-900">
                        Rs. {tx.amount.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(tx.id);
                          setEditAmount(String(tx.amount));
                          setEditDesc(tx.description);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDailyTransaction(tx.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

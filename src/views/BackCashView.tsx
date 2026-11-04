/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Building2, Plus, Trash2, ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const BackCashView: React.FC = () => {
  const {
    filterDate,
    setFilterDate,
    backCashTransactions,
    addBackCash,
    deleteBackCash,
    transferBetweenCashAccounts,
    getBackCashTotal,
    getYesterdayBackCashClosing,
    goBack
  } = usePOS();

  const [type, setType] = useState<'in' | 'out' | 'commission' | 'closing'>('in');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [transferDir, setTransferDir] = useState<'to_shop' | 'to_back'>('to_shop');
  const [transferAmount, setTransferAmount] = useState('');

  const totalBackCash = getBackCashTotal(filterDate);
  const yesterdayClosing = getYesterdayBackCashClosing(filterDate);
  const txs = backCashTransactions.filter(t => t.transaction_date === filterDate);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) return;
    addBackCash({
      type,
      amount: num,
      note: note.trim() || `Back Cash (${type})`,
      transaction_date: filterDate
    });
    setAmount('');
    setNote('');
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(transferAmount);
    if (!num || num <= 0) return;
    transferBetweenCashAccounts({
      from: transferDir === 'to_shop' ? 'back' : 'shop',
      to: transferDir === 'to_shop' ? 'shop' : 'back',
      amount: num,
      transaction_date: filterDate
    });
    setTransferAmount('');
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
              <Building2 className="w-4 h-4 text-slate-700" />
              <span>Back Cash Manager (بیک کیش مینیجر)</span>
            </h2>
            <p className="text-[11px] text-slate-500">Reserve Cash, Commission & Shop Transfers</p>
          </div>
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-bold text-slate-500">Previous Closing Balance</span>
          <div className="text-xl font-black text-slate-900 font-mono mt-1">
            Rs. {yesterdayClosing.toLocaleString()}
          </div>
        </div>
        <div className="bg-slate-900 text-white p-4 rounded-2xl">
          <span className="text-xs font-bold text-slate-300">Total Back Cash Balance</span>
          <div className="text-xl font-black text-amber-400 font-mono mt-1">
            Rs. {totalBackCash.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Add Back Cash Entry */}
      <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <div className="grid grid-cols-4 gap-2">
          {(['in', 'out', 'commission', 'closing'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`py-2 rounded-xl font-black uppercase cursor-pointer border ${
                type === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {t}
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
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note / تفصیل"
            className="sm:col-span-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Back Cash Record</span>
        </button>
      </form>

      {/* Quick Transfer */}
      <form onSubmit={handleTransfer} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <div className="font-black text-slate-800 flex items-center gap-1.5">
          <ArrowLeftRight className="w-4 h-4 text-blue-600" />
          <span>Quick Cash Transfer (Shop Counter ↔ Back Cash)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={transferDir}
            onChange={e => setTransferDir(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
          >
            <option value="to_shop">Back Cash → Shop Counter</option>
            <option value="to_back">Shop Counter → Back Cash</option>
          </select>
          <input
            type="number"
            value={transferAmount}
            onChange={e => setTransferAmount(e.target.value)}
            placeholder="Transfer Amount"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl cursor-pointer"
          >
            Transfer
          </button>
        </div>
      </form>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-black text-xs text-slate-700">
          Back Cash Entries ({txs.length})
        </div>
        <div className="divide-y divide-slate-100">
          {txs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No entries for this date.</div>
          ) : (
            txs.map(tx => (
              <div key={tx.id} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold uppercase text-[10px] mr-2">
                    {tx.type}
                  </span>
                  <span className="font-bold text-slate-900">{tx.note}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black font-mono text-sm">Rs. {tx.amount.toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => deleteBackCash(tx.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

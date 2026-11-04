/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Smartphone, ArrowLeft, Check } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const EasyloadLedgerView: React.FC = () => {
  const {
    filterDate,
    setFilterDate,
    easyloadRecords,
    saveEasyloadRecord,
    saveEasyloadPurchase,
    getEasyloadSaleSummary,
    goBack
  } = usePOS();

  const rec = easyloadRecords[filterDate] || {
    date_recorded: filterDate,
    jazz_opening: 0,
    jazz_purchase: 0,
    jazz_closing: 0,
    telenor_opening: 0,
    telenor_purchase: 0,
    telenor_closing: 0,
    zong_opening: 0,
    zong_purchase: 0,
    zong_closing: 0,
    ufone_opening: 0,
    ufone_purchase: 0,
    ufone_closing: 0,
    total_commission_earned: 0
  };

  const summary = getEasyloadSaleSummary(filterDate);
  const [purchNet, setPurchNet] = useState<'jazz' | 'telenor' | 'zong' | 'ufone'>('jazz');
  const [purchAmount, setPurchAmount] = useState('');

  const handleFieldChange = (field: string, val: string) => {
    saveEasyloadRecord(filterDate, { [field]: Number(val) || 0 });
  };

  const handlePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(purchAmount);
    if (!num || num <= 0) return;
    saveEasyloadPurchase(purchNet, num);
    setPurchAmount('');
  };

  const networks = [
    { key: 'jazz', label: 'Jazz / Warid', sale: summary.jazz },
    { key: 'telenor', label: 'Telenor', sale: summary.telenor },
    { key: 'zong', label: 'Zong', sale: summary.zong },
    { key: 'ufone', label: 'Ufone', sale: summary.ufone }
  ] as const;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>Easy Load Ledger (ایزی لوڈ کھاتہ)</span>
            </h2>
            <p className="text-[11px] text-slate-500">Total Load Sale: Rs. {summary.total.toLocaleString()}</p>
          </div>
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        />
      </div>

      {/* Purchase Load Form */}
      <form onSubmit={handlePurchase} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <div className="font-black text-slate-800">Add New Load Purchase (+2.4% Auto Commission)</div>
        <div className="flex flex-wrap gap-2">
          <select
            value={purchNet}
            onChange={e => setPurchNet(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase"
          >
            <option value="jazz">Jazz</option>
            <option value="telenor">Telenor</option>
            <option value="zong">Zong</option>
            <option value="ufone">Ufone</option>
          </select>
          <input
            type="number"
            value={purchAmount}
            onChange={e => setPurchAmount(e.target.value)}
            placeholder="Cash Paid (Rs.)"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl flex items-center gap-1 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Add Load</span>
          </button>
        </div>
      </form>

      {/* Network Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {networks.map(n => {
          const openVal = (rec as any)[`${n.key}_opening`] || 0;
          const purchVal = (rec as any)[`${n.key}_purchase`] || 0;
          const closeVal = (rec as any)[`${n.key}_closing`] || 0;
          return (
            <div key={n.key} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-black text-sm text-slate-900">{n.label}</span>
                <span className="font-mono font-black text-emerald-700">Sale: Rs. {Math.round(n.sale).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Opening</label>
                  <input
                    type="number"
                    value={openVal}
                    onChange={e => handleFieldChange(`${n.key}_opening`, e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Purchase</label>
                  <input
                    type="number"
                    value={purchVal}
                    onChange={e => handleFieldChange(`${n.key}_purchase`, e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Closing</label>
                  <input
                    type="number"
                    value={closeVal}
                    onChange={e => handleFieldChange(`${n.key}_closing`, e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

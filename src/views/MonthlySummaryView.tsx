/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const MonthlySummaryView: React.FC = () => {
  const { filterDate, setFilterDate, getBachatProfit, getCommissionStats, goBack } = usePOS();
  const bachat = getBachatProfit(filterDate);
  const comm = getCommissionStats(filterDate);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Monthly Cash & Profit Summary (ماہانہ خلاصہ اور بچت)</span>
            </h2>
            <p className="text-[11px] text-slate-500">Bachat Calculator & Commission Analytics</p>
          </div>
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-bold text-slate-500">Easyload Profit (2.4%)</span>
          <div className="text-lg font-black text-emerald-700 font-mono mt-1">
            Rs. {Math.round(bachat.calculatedLoadBachat).toLocaleString()}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-bold text-slate-500">Shop Sale Profit (8%)</span>
          <div className="text-lg font-black text-blue-700 font-mono mt-1">
            Rs. {Math.round(bachat.calculatedShopBachat).toLocaleString()}
          </div>
        </div>
        <div className="bg-indigo-600 text-white p-4 rounded-2xl">
          <span className="text-xs font-bold text-indigo-100">Total Net Bachat</span>
          <div className="text-xl font-black font-mono mt-1">
            Rs. {Math.round(bachat.totalNetBachat).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-3 gap-3 text-center text-xs">
        <div>
          <span className="text-slate-500 font-bold block">Daily Commission</span>
          <span className="text-base font-black font-mono text-slate-900">Rs. {comm.daily.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-slate-500 font-bold block">Weekly Commission</span>
          <span className="text-base font-black font-mono text-slate-900">Rs. {comm.weekly.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-slate-500 font-bold block">Monthly Commission</span>
          <span className="text-base font-black font-mono text-slate-900">Rs. {comm.monthly.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

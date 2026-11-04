/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Truck, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const WholesalerBillsView: React.FC = () => {
  const { wholesalers, addWholesaler, payWholesaler, addNewBillWholesaler, deleteWholesaler, goBack } = usePOS();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addWholesaler({
      customer_name: name.trim(),
      phone: phone.trim(),
      total_bill: Number(billAmount) || 0
    });
    setName('');
    setPhone('');
    setBillAmount('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center gap-2.5">
        <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-rose-600" />
            <span>Wholesaler Ledger (ہول سیلر کھاتہ)</span>
          </h2>
          <p className="text-[11px] text-slate-500">Agency & Supplier Payable Accounts</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
        <input
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Wholesaler / Agency Name *"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
        />
        <input
          type="text"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Phone Number"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
        />
        <input
          type="number"
          value={billAmount}
          onChange={e => setBillAmount(e.target.value)}
          placeholder="Opening Bill (Rs.)"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
        />
        <button
          type="submit"
          className="py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl flex items-center justify-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Wholesaler</span>
        </button>
      </form>

      <div className="space-y-3">
        {wholesalers.map(w => (
          <div key={w.id} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900">{w.customer_name}</h3>
                <p className="text-slate-500">{w.phone || 'No phone'} • Total: Rs. {w.total_bill.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-rose-700">
                  Rem: Rs. {w.remaining_balance.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => deleteWholesaler(w.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                value={payAmounts[w.id] || ''}
                onChange={e => setPayAmounts(prev => ({ ...prev, [w.id]: e.target.value }))}
                placeholder="Enter Amount (Rs.)"
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
              />
              <button
                type="button"
                onClick={() => {
                  const amt = Number(payAmounts[w.id]);
                  if (amt > 0) {
                    payWholesaler(w.id, amt);
                    setPayAmounts(prev => ({ ...prev, [w.id]: '' }));
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-xl cursor-pointer"
              >
                Pay Bill (-)
              </button>
              <button
                type="button"
                onClick={() => {
                  const amt = Number(payAmounts[w.id]);
                  if (amt > 0) {
                    addNewBillWholesaler(w.id, amt);
                    setPayAmounts(prev => ({ ...prev, [w.id]: '' }));
                  }
                }}
                className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-xl cursor-pointer"
              >
                New Bill (+)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

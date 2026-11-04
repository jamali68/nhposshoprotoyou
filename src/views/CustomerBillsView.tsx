/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Users, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const CustomerBillsView: React.FC = () => {
  const { customers, addCustomer, receiveCustomerPayment, payMoreCustomer, deleteCustomer, goBack } = usePOS();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addCustomer({
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
            <Users className="w-4 h-4 text-purple-600" />
            <span>Customer Khata (کسٹمر ادھار کھاتہ)</span>
          </h2>
          <p className="text-[11px] text-slate-500">Customer Credit & Recovery Ledger</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
        <input
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Customer Name *"
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
          placeholder="Opening Udhaar (Rs.)"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
        />
        <button
          type="submit"
          className="py-2 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl flex items-center justify-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </form>

      <div className="space-y-3">
        {customers.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900">{c.customer_name}</h3>
                <p className="text-slate-500">{c.phone || 'No phone'} • Total: Rs. {c.total_bill.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-purple-700">
                  Udhaar: Rs. {c.remaining_balance.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => deleteCustomer(c.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                value={amounts[c.id] || ''}
                onChange={e => setAmounts(prev => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Amount (Rs.)"
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
              />
              <button
                type="button"
                onClick={() => {
                  const amt = Number(amounts[c.id]);
                  if (amt > 0) {
                    receiveCustomerPayment(c.id, amt);
                    setAmounts(prev => ({ ...prev, [c.id]: '' }));
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-xl cursor-pointer"
              >
                Wasooli (-)
              </button>
              <button
                type="button"
                onClick={() => {
                  const amt = Number(amounts[c.id]);
                  if (amt > 0) {
                    payMoreCustomer(c.id, amt);
                    setAmounts(prev => ({ ...prev, [c.id]: '' }));
                  }
                }}
                className="px-3 py-1.5 bg-purple-600 text-white font-bold rounded-xl cursor-pointer"
              >
                New Udhaar (+)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

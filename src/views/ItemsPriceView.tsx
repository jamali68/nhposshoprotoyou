/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Tags, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const ItemsPriceView: React.FC = () => {
  const { bottleItems, addBottleItem, deleteBottleItem, goBack } = usePOS();
  const [name, setName] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addBottleItem({
      item_name: name.trim(),
      unit_price: Number(retail) || 0,
      wholesale_price: Number(wholesale) || 0,
      commission_per_unit: 10
    });
    setName('');
    setRetail('');
    setWholesale('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center gap-2.5">
        <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
            <Tags className="w-4 h-4 text-teal-600" />
            <span>Items Price List (اشیاء کی قیمتیں)</span>
          </h2>
          <p className="text-[11px] text-slate-500">Retail & Wholesale Price Catalog</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
        <input
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Item Name"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
        />
        <input
          type="number"
          required
          value={retail}
          onChange={e => setRetail(e.target.value)}
          placeholder="Retail Price (Rs.)"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
        />
        <input
          type="number"
          value={wholesale}
          onChange={e => setWholesale(e.target.value)}
          placeholder="Wholesale Price (Rs.)"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
        />
        <button
          type="submit"
          className="py-2 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl flex items-center justify-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Item</span>
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {bottleItems.map(item => (
            <div key={item.id} className="p-3.5 flex items-center justify-between text-xs">
              <div>
                <div className="font-black text-slate-900 text-sm">{item.item_name}</div>
                <div className="text-slate-500 font-mono">
                  Retail: Rs. {item.unit_price} | Wholesale: Rs. {item.wholesale_price || item.unit_price}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteBottleItem(item.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

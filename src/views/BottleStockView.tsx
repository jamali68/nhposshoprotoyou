/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Wine, Plus, Minus, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const BottleStockView: React.FC = () => {
  const { bottleItems, updateItemStock, addBottleItem, goBack } = usePOS();
  const [itemName, setItemName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [commission, setCommission] = useState('15');

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    addBottleItem({
      item_name: itemName.trim(),
      unit_price: Number(unitPrice) || 180,
      commission_per_unit: Number(commission) || 15
    });
    setItemName('');
    setUnitPrice('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center gap-2.5">
        <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
            <Wine className="w-4 h-4 text-cyan-600" />
            <span>Bottle & Crate Stock (بوتل اور کریٹ اسٹاک)</span>
          </h2>
          <p className="text-[11px] text-slate-500">Manage inventory & stock in/out</p>
        </div>
      </div>

      <form onSubmit={handleAddNew} className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
        <input
          type="text"
          required
          value={itemName}
          onChange={e => setItemName(e.target.value)}
          placeholder="Item Name (e.g. Pepsi 1.5L)"
          className="sm:col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
        />
        <input
          type="number"
          required
          value={unitPrice}
          onChange={e => setUnitPrice(e.target.value)}
          placeholder="Price (Rs.)"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
        />
        <button
          type="submit"
          className="py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-black rounded-xl cursor-pointer"
        >
          + Add Bottle Item
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bottleItems.map(item => (
          <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <h3 className="font-black text-sm text-slate-900">{item.item_name}</h3>
              <p className="text-slate-500 font-mono">Rs. {item.unit_price} | Stock: {item.total_stock}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateItemStock(item.id, 1, 'remove')}
                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 bg-slate-100 rounded-lg font-mono font-black text-sm">
                {item.total_stock}
              </span>
              <button
                type="button"
                onClick={() => updateItemStock(item.id, 1, 'add')}
                className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

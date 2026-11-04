/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const POSSaleView: React.FC = () => {
  const { bottleItems, cart, addToCart, updateCartQty, clearCart, completeSale, goBack } = usePOS();
  const [lastSaleMsg, setLastSaleMsg] = useState<string | null>(null);

  const total = cart.reduce((acc, i) => acc + i.price * i.qty, 0);

  const handleCheckout = () => {
    const res = completeSale();
    if (res.success) {
      setLastSaleMsg(`Bill #${res.saleId} completed! Total: Rs. ${res.total?.toLocaleString()}`);
      setTimeout(() => setLastSaleMsg(null), 4000);
    }
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
              <ShoppingCart className="w-4 h-4 text-amber-600" />
              <span>POS Sale Counter (پی او ایس بلنگ)</span>
            </h2>
            <p className="text-[11px] text-slate-500">Tap items to add to bill</p>
          </div>
        </div>
      </div>

      {lastSaleMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-black flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{lastSaleMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {bottleItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => addToCart(item)}
              className="bg-white hover:bg-blue-50/50 p-3.5 rounded-2xl border border-slate-200 text-left transition-all cursor-pointer active:scale-95"
            >
              <div className="font-black text-xs text-slate-900 truncate">{item.item_name}</div>
              <div className="text-sm font-black font-mono text-blue-600 mt-1">Rs. {item.unit_price}</div>
              <div className="text-[10px] text-slate-400">Stock: {item.total_stock}</div>
            </button>
          ))}
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-black text-xs text-slate-800">Current Bill ({cart.length})</span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-[11px] text-rose-600 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Cart is empty</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {cart.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">{c.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        Rs. {c.price} x {c.qty} = Rs. {c.price * c.qty}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateCartQty(c.id, c.qty - 1)}
                        className="p-1 bg-white border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-mono font-bold">{c.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(c.id, c.qty + 1)}
                        className="p-1 bg-white border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-sm font-black">
              <span>Total Payable:</span>
              <span className="font-mono text-lg text-emerald-700">Rs. {total.toLocaleString()}</span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCheckout}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs cursor-pointer disabled:opacity-50"
            >
              Complete Sale & Add to Cash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Store, User, Phone, MapPin, Lock, Sparkles } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const ShopSetupModal: React.FC = () => {
  const { isNewShopSetupRequired, completeShopSetup, currentShop, currentUser } = usePOS();
  const [shopName, setShopName] = useState(currentShop?.shop_name || '');
  const [ownerName, setOwnerName] = useState(currentShop?.owner_name || currentUser?.name || '');
  const [phone, setPhone] = useState(currentShop?.phone || '');
  const [address, setAddress] = useState(currentShop?.address || '');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isNewShopSetupRequired) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) return;
    setIsSaving(true);
    await completeShopSetup(
      shopName.trim(),
      phone.trim(),
      address.trim(),
      ownerName.trim() || 'Shop Owner',
      password.trim() || undefined
    );
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
        <div className="bg-gradient-to-r from-[#1b263b] to-slate-800 text-white p-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
              <Store className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-black text-base">اپنی دکان کی تفصیلات مکمل کریں</h3>
              <p className="text-[11px] text-slate-300">Complete your store setup to get started</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Shop Name (دکان کا نام) *</label>
            <div className="relative">
              <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                placeholder="e.g. Taj Super Store"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Owner Name (مالک کا نام) *</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="e.g. Muhammad Wasi"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Set Shop Password (دکان کا پاس ورڈ)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Phone</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">City / Address</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Main Bazar"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving || !shopName.trim()}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save & Open Shop'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

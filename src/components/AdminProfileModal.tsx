/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Store, User, Phone, MapPin, Lock, X, Check } from 'lucide-react';
import { usePOS } from '../context/POSContext';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentShop, currentUser, updateShopProfile } = usePOS();
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShopName(currentShop?.shop_name || currentUser?.shopName || '');
      setOwnerName(currentShop?.owner_name || currentUser?.name || '');
      setPhone(currentShop?.phone || '');
      setAddress(currentShop?.address || '');
      setNewPassword('');
    }
  }, [isOpen, currentShop, currentUser]);

  if (!isOpen) return null;

  const isStoreAdmin = Boolean(
    currentUser?.isGoogleUser || currentUser?.role === 'admin' || currentUser?.role === 'super_admin'
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStoreAdmin) {
      onClose();
      return;
    }
    setIsSaving(true);
    await updateShopProfile({
      shop_name: shopName.trim() || currentShop?.shop_name || 'NH POS Shop',
      owner_name: ownerName.trim() || currentShop?.owner_name || 'Shop Owner',
      phone: phone.trim(),
      address: address.trim(),
      ...(newPassword.trim().length >= 6 ? { password: newPassword.trim() } : {})
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
        <div className="bg-[#1b263b] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-black text-sm">دکان اور ایڈمن پروفائل</h3>
              <p className="text-[10px] text-slate-300">Shop & Owner Profile Settings</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Shop Name (دکان کا نام)</label>
            <div className="relative">
              <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                disabled={!isStoreAdmin}
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Owner Name (مالک کا نام)</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                disabled={!isStoreAdmin}
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 disabled:opacity-60"
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
                  disabled={!isStoreAdmin}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Address</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  disabled={!isStoreAdmin}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {isStoreAdmin && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Change Shop Password (نیا پاس ورڈ - اختیاری)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
            >
              Close
            </button>
            {isStoreAdmin && (
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

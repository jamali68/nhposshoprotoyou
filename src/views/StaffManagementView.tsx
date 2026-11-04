/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserCheck, Plus, Trash2, KeyRound, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const StaffManagementView: React.FC = () => {
  const { staffAccounts, addStaffAccount, updateStaffAccount, deleteStaffAccount, goBack } = usePOS();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'cashier' | 'manager' | 'salesman'>('cashier');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await addStaffAccount({
      name: name.trim(),
      username: username.trim(),
      password: password.trim(),
      role,
      phone: phone.trim(),
      is_active: true
    });
    if (res.success) {
      setFeedback({ type: 'success', text: 'نیا اسٹاف اکاؤنٹ کامیابی سے بن گیا ہے!' });
      setName('');
      setUsername('');
      setPassword('');
      setPhone('');
    } else {
      setFeedback({ type: 'error', text: res.error || 'اسٹاف اکاؤنٹ بنانے میں مسئلہ پیش آیا۔' });
    }
  };

  const handlePasswordReset = async (staffId: string) => {
    const newPass = (resetPasswords[staffId] || '').trim();
    if (newPass.length < 6) {
      setFeedback({ type: 'error', text: 'پاس ورڈ کم از کم 6 ہندسوں کا ہونا ضروری ہے۔' });
      return;
    }
    const target = staffAccounts.find(s => s.id === staffId);
    if (!target) return;
    const res = await updateStaffAccount({
      ...target,
      password: newPass
    });
    if (res.success) {
      setResetPasswords(prev => ({ ...prev, [staffId]: '' }));
      setFeedback({ type: 'success', text: `${target.username} کا نیا پاس ورڈ اپڈیٹ ہو گیا ہے!` });
    } else {
      setFeedback({ type: 'error', text: res.error || 'پاس ورڈ اپڈیٹ نہیں ہو سکا۔' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex items-center gap-2.5">
        <button type="button" onClick={goBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="font-black text-base text-slate-900 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-purple-600" />
            <span>Staff & User Accounts (عملہ اور اسٹاف اکاؤنٹس)</span>
          </h2>
          <p className="text-[11px] text-slate-500">Create NH- staff logins & reset staff passwords</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <div className="font-black text-slate-800">Create New Staff Account (نیا اسٹاف ممبر بنائیں)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Staff Full Name *"
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
          />
          <input
            type="text"
            required
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username (e.g. NH-ali01) *"
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
          />
          <input
            type="text"
            required
            minLength={6}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password (Min 6 chars) *"
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as any)}
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
          >
            <option value="cashier">Cashier (کیشیئر)</option>
            <option value="manager">Manager (مینیجر)</option>
            <option value="salesman">Salesman (سیلز مین)</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Staff Account</span>
        </button>
      </form>

      <div className="space-y-3">
        {staffAccounts.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
            ابھی تک کوئی اسٹاف اکاؤنٹ نہیں بنایا گیا۔
          </div>
        ) : (
          staffAccounts.map(staff => (
            <div key={staff.id} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-black text-sm text-slate-900">{staff.name}</span>
                  <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-mono font-bold">
                    {staff.username}
                  </span>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Role: <strong className="uppercase">{staff.role}</strong> • Current Password:{' '}
                    <span className="font-mono font-bold text-slate-800">{staff.password}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteStaffAccount(staff.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={resetPasswords[staff.id] || ''}
                  onChange={e => setResetPasswords(prev => ({ ...prev, [staff.id]: e.target.value }))}
                  placeholder="Enter new password to reset (Min 6 chars)"
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={() => handlePasswordReset(staff.id)}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl cursor-pointer"
                >
                  Reset Password
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

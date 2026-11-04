/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Mail, ShieldCheck, RefreshCw, X, AlertCircle } from 'lucide-react';

interface GmailOTPModalProps {
  email: string;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string }>;
  onResend: () => Promise<{ success: boolean; otp?: string; error?: string }>;
  onCancel: () => void;
}

export const GmailOTPModal: React.FC<GmailOTPModalProps> = ({
  email,
  onVerify,
  onResend,
  onCancel
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const res = await onVerify(code.trim());
    setIsLoading(false);
    if (!res.success) {
      setError(res.error || 'غلط کوڈ درج کیا گیا ہے۔');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 p-6 text-center space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-blue-700 font-black text-sm">
            <ShieldCheck className="w-5 h-5" />
            <span>ای میل تصدیقی کوڈ (OTP)</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600">
          ہم نے <strong>{email}</strong> پر 6 ہندسوں کا تصدیقی کوڈ بھیجا ہے۔
        </p>

        {error && (
          <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="000000"
            className="w-full py-3 text-center text-lg font-mono font-black tracking-widest bg-slate-50 border border-slate-300 rounded-xl"
          />
          <button
            type="submit"
            disabled={isLoading || code.trim().length < 6}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs cursor-pointer disabled:opacity-60"
          >
            {isLoading ? 'Verifying...' : 'تصدیق کریں (Verify)'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => onResend()}
          className="text-xs font-bold text-slate-500 hover:text-blue-600 inline-flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Resend Code</span>
        </button>
      </div>
    </div>
  );
};

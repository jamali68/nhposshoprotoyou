/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { useAppVersion } from '../utils/version';

export const WhatsNewModal: React.FC = () => {
  const { showWhatsNewModal, setShowWhatsNewModal } = usePOS();
  const { version: appVersion } = useAppVersion();

  if (!showWhatsNewModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#1b263b] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base">What&apos;s New in Version {appVersion}</h3>
          </div>

          <button
            type="button"
            onClick={() => setShowWhatsNewModal(false)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 max-h-80 overflow-y-auto">
          <div className="space-y-3 text-left">
            <p className="text-xs text-slate-500 font-medium">
              We have released version {appVersion} with exciting updates, performance enhancements, and bug fixes:
            </p>
            <ul className="text-xs text-slate-700 space-y-3 list-disc pl-4 leading-relaxed">
              <li>
                <span className="font-bold text-slate-900">Smart 3-Button Login Screen:</span> Streamlined top navigation into 3 clean buttons (<strong>Admin Login</strong>, <strong>Staff Login</strong>, and <strong>Demo</strong>), with a smart Sign In / Create New Shop switcher built right inside Admin Login.
              </li>
              <li>
                <span className="font-bold text-slate-900">Google Password Reset &amp; Instant New Password Popup:</span> On the Reset Password page, users can click &ldquo;Continue with Google&rdquo; at the top using their registered shop email to log in and immediately set a new password via an automatic popup.
              </li>
              <li>
                <span className="font-bold text-slate-900">Super Admin Security Lock (Sidebar-Only Entry):</span> Removed the Super Admin button from the Login screen; Super Admin Portal is strictly accessible only from the Sidebar when logged in with the 2 authorized Master emails.
              </li>
              <li>
                <span className="font-bold text-slate-900">Data Update Delay &amp; Loading Wheel (All Accounts):</span> Every Add, Edit, and Delete action displays a clear spinning Loading Wheel for 1.0 sec (default), configurable anytime by Super Admin for all accounts.
              </li>
              <li>
                <span className="font-bold text-slate-900">Instant Multi-User Online &amp; Offline Sync:</span> Store Admin and Staff (`NH-`) accounts can log in online or offline seamlessly, with instant real-time cloud sync across all connected devices of the same shop.
              </li>
              <li>
                <span className="font-bold text-slate-900">Super Admin Master Portal &amp; Server Core:</span> Secure master control with Netlify Functions (`authCore.js`), PBKDF2-SHA256 password encryption, live multi-shop database management, and module controls.
              </li>
              <li>
                <span className="font-bold text-slate-900">Progressive Web App (PWA v17.3.1):</span> Enhanced offline caching, fast background updates, and full compatibility across AI Studio, GitHub Pages, and Netlify.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShowWhatsNewModal(false)}
            className="flex items-center gap-1.5 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Got it, Thanks!</span>
          </button>
        </div>
      </div>
    </div>
  );
};

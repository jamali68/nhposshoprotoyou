/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Wrench, ShieldAlert } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { superAdminService } from '../superadmin/superAdminService';

export const MaintenanceModal: React.FC = () => {
  const { isMaintenanceMode, maintenanceNotice, currentUser, toggleMaintenanceMode } = usePOS();

  if (!isMaintenanceMode) return null;

  const isSuperAdmin = Boolean(
    currentUser?.role === 'super_admin' &&
    superAdminService.isMasterAdminEmail(currentUser?.email)
  );

  // Super Admin sees a non-blocking floating banner; others see modal notice
  if (isSuperAdmin) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-amber-300 max-w-md w-full p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
          <Wrench className="w-7 h-7" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 rounded-full text-[11px] font-bold border border-amber-200">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>سسٹم مینٹیننس موڈ فعال ہے</span>
        </div>
        <h3 className="text-lg font-black text-slate-900">System Under Maintenance</h3>
        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          {maintenanceNotice}
        </p>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={toggleMaintenanceMode}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Disable Maintenance Mode
          </button>
        )}
      </div>
    </div>
  );
};

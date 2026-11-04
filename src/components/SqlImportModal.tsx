/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileCode, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePOS } from '../context/POSContext';

interface SqlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SqlImportModal: React.FC<SqlImportModalProps> = ({ isOpen, onClose }) => {
  const { importSqlData } = usePOS();
  const [targetEntity, setTargetEntity] = useState<'bottle_items' | 'customers' | 'wholesalers' | 'daily_transactions'>('bottle_items');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = String(ev.target?.result || '');
      try {
        // Extract simple JSON or SQL VALUES rows
        const parsedRecords: any[] = [];
        const jsonMatch = content.trim().startsWith('[');
        if (jsonMatch) {
          const arr = JSON.parse(content);
          if (Array.isArray(arr)) parsedRecords.push(...arr);
        }
        const res = importSqlData({
          targetEntity,
          records: parsedRecords,
          mode
        });
        if (res.success) {
          setStatusMsg({ type: 'success', text: `Successfully processed (${res.count} records).` });
        } else {
          setStatusMsg({ type: 'error', text: res.error || 'Failed to import SQL file.' });
        }
      } catch (err: any) {
        setStatusMsg({ type: 'error', text: err?.message || 'Error parsing file.' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
        <div className="bg-[#1b263b] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-cyan-400" />
            <h3 className="font-black text-sm">Smart SQL Data Import (.sql)</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Target Module</label>
            <select
              value={targetEntity}
              onChange={e => setTargetEntity(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
            >
              <option value="bottle_items">Items & Bottle Stock</option>
              <option value="customers">Customer Ledger</option>
              <option value="wholesalers">Wholesaler Ledger</option>
              <option value="daily_transactions">Daily Cash Book</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Import Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('append')}
                className={`py-2 rounded-xl font-bold border cursor-pointer ${
                  mode === 'append' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Append to Existing
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`py-2 rounded-xl font-bold border cursor-pointer ${
                  mode === 'replace' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Replace Existing
              </button>
            </div>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-xl border font-bold flex items-center gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <label className="w-full py-4 border-2 border-dashed border-cyan-400 bg-cyan-50/50 hover:bg-cyan-50 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer">
            <Upload className="w-6 h-6 text-cyan-600" />
            <span className="font-bold text-cyan-900">Select .sql or .json File</span>
            <input type="file" accept=".sql,.json" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

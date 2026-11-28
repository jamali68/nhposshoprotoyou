/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Search,
  PlusCircle,
  Edit2,
  Trash2,
  History,
  CheckCircle,
  FileText,
  Calendar,
  X,
  Printer,
  Image as ImageIcon,
  MessageCircle
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { WholesalerBill } from '../types/pos';
import { PrintReceiptModal } from '../components/PrintReceiptModal';
import { showAppAlert, showAppConfirm } from '../components/AppDialogHost';
import { AmountInput } from '../components/AmountInput';
import { StickyPageHeader } from '../components/StickyPageHeader';
import { superAdminService } from '../superadmin/superAdminService';
import {
  downloadLedgerAsJpg,
  downloadLedgerAsPdf,
  shareLedgerOnWhatsApp,
  LedgerExportPayload
} from '../utils/ledgerExport';

export const WholesalerBillsView: React.FC = () => {
  const {
    currentUser,
    currentShop,
    wholesalers,
    addWholesaler,
    payWholesaler,
    addNewBillWholesaler,
    updateWholesaler,
    deleteWholesaler,
    getTotalWholesalerPayable,
    dailyTransactions,
    setActiveView
  } = usePOS();

  const userWithShop = { ...currentUser, shopId: currentShop?.id || currentUser?.shopId };

  const [search, setSearch] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // New Wholesaler Form
  const [name, setName] = useState<string>('');
  const [totalBill, setTotalBill] = useState<string>('');
  const [invNum, setInvNum] = useState<string>('');
  const [agencyNum, setAgencyNum] = useState<string>('');
  const [supplierNum, setSupplierNum] = useState<string>('');
  const [orderDay, setOrderDay] = useState<string>('');
  const [supplyDay, setSupplyDay] = useState<string>('');

  // Payment inputs per row
  const [payInputs, setPayInputs] = useState<Record<string, string>>({});
  const [addBillInputs, setAddBillInputs] = useState<Record<string, string>>({});

  // Edit Modal
  const [editItem, setEditItem] = useState<WholesalerBill | null>(null);
  const [editBillStr, setEditBillStr] = useState<string>('');
  const [editRemainingStr, setEditRemainingStr] = useState<string>('');

  const sanitizeNumberInput = (rawVal: string): string => {
    if (rawVal === '') return '';
    if (rawVal.length > 1 && rawVal.startsWith('0') && rawVal[1] !== '.') {
      return rawVal.replace(/^0+/, '') || '0';
    }
    return rawVal;
  };

  // Compute accurate lifetime totals for a wholesaler (Total Bill, Ada Kiya / Paid, Baqi Dena Hai)
  const getWholesalerLifetimeTotals = (w: WholesalerBill) => {
    const linkedTxs = dailyTransactions.filter(
      t => t.bill_id === w.id && t.party_type === 'wholesaler'
    );
    const txPaid = linkedTxs
      .filter(t => t.type === 'out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const txAdded = linkedTxs
      .filter(t => t.type !== 'out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const remaining = Math.max(0, Number(w.remaining_balance) || 0);
    const storedTotalBill = Math.max(0, Number(w.total_bill) || 0);
    const storedPaid = Math.max(0, Number(w.total_paid) || 0);

    const totalPaid = Math.max(storedPaid, txPaid, Math.max(0, storedTotalBill - remaining));
    const totalBill = Math.max(storedTotalBill, txAdded, totalPaid + remaining);

    return {
      totalBill,
      totalPaid,
      remaining
    };
  };

  const openEditWholesalerModal = (w: WholesalerBill) => {
    if (!superAdminService.isActionUnlockedForUser('allowManageBills', userWithShop)) {
      showAppAlert('🔒 ہول سیلر کھاتہ ایڈٹ کرنے کی اجازت فی الحال لاک (Locked) ہے۔');
      return;
    }
    const { totalBill: lifetimeBill, remaining } = getWholesalerLifetimeTotals(w);
    setEditItem({ ...w });
    setEditBillStr(lifetimeBill === 0 ? '' : lifetimeBill.toString());
    setEditRemainingStr(remaining === 0 ? '' : remaining.toString());
  };

  // Statement Ledger Modal
  const [statementWholesaler, setStatementWholesaler] = useState<WholesalerBill | null>(null);
  const [printReceiptBill, setPrintReceiptBill] = useState<WholesalerBill | null>(null);
  const [exportStatusMsg, setExportStatusMsg] = useState<string>('');

  const triggerExportFeedback = (msg: string) => {
    setExportStatusMsg(msg);
    setTimeout(() => setExportStatusMsg(''), 2600);
  };

  const buildWholesalerLedgerExportPayload = (w: WholesalerBill): LedgerExportPayload => {
    const { totalBill: lifetimeBill, totalPaid, remaining } = getWholesalerLifetimeTotals(w);
    const wholesalerTxs = dailyTransactions.filter(
      t => t.bill_id === w.id && t.party_type === 'wholesaler'
    );

    const entries =
      wholesalerTxs.length > 0
        ? wholesalerTxs.map(tx => ({
            description: tx.description,
            date: tx.transaction_date,
            by: tx.created_by_name || tx.created_by,
            type: tx.amount === 0 ? 'opening' : tx.type,
            amount: Number(tx.amount) || 0,
            amountLabel:
              tx.amount === 0
                ? 'Rs. 0 (Opening)'
                : tx.type === 'out'
                ? `Paid: - Rs. ${(Number(tx.amount) || 0).toLocaleString()}`
                : `Added: + Rs. ${(Number(tx.amount) || 0).toLocaleString()}`,
            amountTone: (tx.amount === 0
              ? 'slate'
              : tx.type === 'out'
              ? 'emerald'
              : 'blue') as 'slate' | 'emerald' | 'blue'
          }))
        : [
            {
              description:
                lifetimeBill === 0
                  ? 'Khata Started (Opening Balance: Rs. 0)'
                  : 'Opening Bill / Payable',
              date: w.created_date,
              by: 'Khata Created',
              type: 'opening',
              amount: lifetimeBill,
              amountLabel: `Rs. ${lifetimeBill.toLocaleString()} (Opening)`,
              amountTone: 'slate' as const
            }
          ];

    const scheduleParts: string[] = [];
    if (w.order_day) scheduleParts.push(`Order: ${w.order_day}`);
    if (w.supply_day) scheduleParts.push(`Supply: ${w.supply_day}`);

    return {
      shopName: currentShop?.shop_name || currentUser?.shopName || 'NH POS Shop',
      shopPhone: currentShop?.phone,
      partyTypeLabel: 'Wholesaler',
      partyName: w.customer_name,
      partyPhone: w.agency_dealer_number || w.supplier_number,
      invoiceNumber: w.invoice_number,
      extraMeta: scheduleParts.length > 0 ? scheduleParts.join(' | ') : undefined,
      totalGivenLabel: 'Total Bill',
      totalReceivedLabel: 'Ada Kiya',
      remainingLabel: 'Baqi Dena Hai',
      totalGiven: lifetimeBill,
      totalReceived: totalPaid,
      remaining,
      entries
    };
  };

  const totalPayable = getTotalWholesalerPayable();
  const totalCount = wholesalers.length;
  const activeCount = wholesalers.filter(w => w.remaining_balance > 0).length;
  const inactiveCount = wholesalers.filter(w => w.remaining_balance <= 0).length;

  const filteredList = wholesalers.filter(w => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.customer_name.toLowerCase().includes(q) ||
      (w.invoice_number && w.invoice_number.toLowerCase().includes(q)) ||
      (w.agency_dealer_number && w.agency_dealer_number.toLowerCase().includes(q)) ||
      w.remaining_balance.toString().includes(q)
    );
  });

  const handleAddWholesaler = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showAppAlert('Wholesaler ka naam zaroori hai!');
      return;
    }
    const billVal = totalBill.trim() === '' ? 0 : parseFloat(totalBill);
    if (isNaN(billVal) || billVal < 0) {
      showAppAlert('Baraye meharbani durust bill amount (0 ya us se zyada) darj karein!');
      return;
    }

    addWholesaler({
      customer_name: name.trim(),
      total_bill: billVal,
      invoice_number: invNum.trim() || undefined,
      agency_dealer_number: agencyNum.trim() || undefined,
      supplier_number: supplierNum.trim() || undefined,
      order_day: orderDay.trim() || undefined,
      supply_day: supplyDay.trim() || undefined
    });

    setName('');
    setTotalBill('');
    setInvNum('');
    setAgencyNum('');
    setSupplierNum('');
    setOrderDay('');
    setSupplyDay('');
    setShowAddForm(false);
  };

  const handlePay = async (bill: WholesalerBill) => {
    if (!superAdminService.isActionUnlockedForUser('allowManageBills', userWithShop)) {
      showAppAlert('🔒 ہول سیلر ادائیگی ریکارڈ کرنے کی اجازت فی الحال لاک (Locked) ہے۔');
      return;
    }
    const inputVal = payInputs[bill.id] !== undefined ? parseFloat(payInputs[bill.id]) : bill.remaining_balance;
    if (isNaN(inputVal) || inputVal <= 0) {
      showAppAlert('Sahi payment amount likhein!');
      return;
    }
    if (inputVal > bill.remaining_balance) {
      showAppAlert('Payment cannot exceed remaining balance!');
      return;
    }

    const confirmed = await showAppConfirm({
      title: 'Confirm Wholesaler Payment',
      message: `Record payment of Rs. ${inputVal.toLocaleString()} to ${bill.customer_name}?`,
      confirmText: 'Record Payment',
      variant: 'primary'
    });
    if (confirmed) {
      payWholesaler(bill.id, inputVal);
      setPayInputs(prev => ({ ...prev, [bill.id]: '' }));
    }
  };

  const handleAddNewBill = (bill: WholesalerBill) => {
    const inputVal = parseFloat(addBillInputs[bill.id]);
    if (isNaN(inputVal) || inputVal <= 0) {
      showAppAlert('Please enter new bill amount!');
      return;
    }

    addNewBillWholesaler(bill.id, inputVal);
    setAddBillInputs(prev => ({ ...prev, [bill.id]: '' }));
  };

  const handleDelete = async (id: string) => {
    if (!superAdminService.isActionUnlockedForUser('allowDeleteEntry', userWithShop)) {
      showAppAlert('🔒 ہول سیلر کھاتہ ڈیلیٹ کرنے کی اجازت فی الحال لاک (Locked) ہے۔');
      return;
    }
    const confirmed = await showAppConfirm({
      title: 'Delete Wholesaler Record',
      message: 'Are you sure you want to delete this wholesaler record?',
      confirmText: 'Delete',
      variant: 'danger'
    });
    if (confirmed) {
      deleteWholesaler(id);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;

    const trimmedName = editItem.customer_name?.trim();
    if (!trimmedName) {
      showAppAlert('Wholesaler ka naam zaroori hai!');
      return;
    }

    const totalBillVal = editBillStr.trim() === '' ? 0 : parseFloat(editBillStr);
    const remainingVal = editRemainingStr.trim() === '' ? 0 : parseFloat(editRemainingStr);

    if (isNaN(totalBillVal) || totalBillVal < 0 || isNaN(remainingVal) || remainingVal < 0) {
      showAppAlert('Baraye meharbani durust raqam (0 ya us se zyada) darj karein!');
      return;
    }

    const effectiveTotalBill = Math.max(totalBillVal, remainingVal);
    const nextTotalPaid = Math.max(0, effectiveTotalBill - remainingVal);

    const updatedWholesaler: WholesalerBill = {
      ...editItem,
      customer_name: trimmedName,
      total_bill: effectiveTotalBill,
      total_paid: nextTotalPaid,
      remaining_balance: remainingVal,
      invoice_number: editItem.invoice_number?.trim() || undefined,
      agency_dealer_number: editItem.agency_dealer_number?.trim() || undefined,
      supplier_number: editItem.supplier_number?.trim() || undefined,
      order_day: editItem.order_day?.trim() || undefined,
      supply_day: editItem.supply_day?.trim() || undefined,
      created_date: editItem.created_date || wFallbackDate(editItem.created_date),
      status: remainingVal <= 0 ? 'paid' : 'pending'
    };

    updateWholesaler(updatedWholesaler);
    setEditItem(null);
  };

  const wFallbackDate = (d?: string) => d || new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4 pb-12">
      {/* Sticky Top Header (Shrinks 50% with frosted glass on scroll) */}
      <StickyPageHeader
        title="Wholesaler Ledger"
        onBack={() => setActiveView('dashboard')}
      />

      {/* Red Summary Banner */}
      <div className="bg-gradient-to-r from-rose-500 to-rose-700 text-white p-4 sm:p-5 rounded-2xl shadow-md flex items-center justify-between">
        <div className="space-y-0.5 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 opacity-80" />
            <span>Total Wholesalers: {totalCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Active: {activeCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-200">
            <span>Inactive: {inactiveCount}</span>
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
            Rs. {totalPayable.toLocaleString()}
          </h2>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider opacity-90">
            TOTAL PAYABLE
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-blue-500 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, amount, or invoice..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-blue-500 rounded-xl font-medium text-xs shadow-xs focus:outline-none focus:border-blue-600"
        />
      </div>

      {/* Toggle Add Wholesaler Form Button */}
      <button
        type="button"
        onClick={() => setShowAddForm(prev => !prev)}
        className="w-full py-3 bg-[#1e293b] hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors"
      >
        <PlusCircle className="w-4 h-4 text-emerald-400" />
        <span>{showAddForm ? '× Close Form' : '+ Add New Wholesaler'}</span>
      </button>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 space-y-3 animate-in fade-in duration-200">
          <h3 className="font-black text-sm text-slate-800 text-center">New Wholesaler Details</h3>
          <form onSubmit={handleAddWholesaler} className="space-y-2.5 text-xs">
            <input
              type="text"
              name="wholesaler_name"
              list="nh-wholesaler-suggestions"
              autoComplete="on"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Wholesaler / Company Name *"
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
            />
            <AmountInput
              value={totalBill}
              onValueChange={setTotalBill}
              placeholder="Total Bill Amount (e.g. 50,000)"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm"
            />

            <div className="pt-1 text-[11px] text-slate-400 font-semibold">Optional Details:</div>
            <input
              type="text"
              value={invNum}
              onChange={e => setInvNum(e.target.value)}
              placeholder="Invoice Number (e.g. PEP-101)"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={agencyNum}
                onChange={e => setAgencyNum(e.target.value)}
                placeholder="Agency/Dealer Phone No"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              />
              <input
                type="text"
                value={supplierNum}
                onChange={e => setSupplierNum(e.target.value)}
                placeholder="Supplier Phone No"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={orderDay}
                onChange={e => setOrderDay(e.target.value)}
                placeholder="Order Day (e.g. Monday)"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              />
              <input
                type="text"
                value={supplyDay}
                onChange={e => setSupplyDay(e.target.value)}
                placeholder="Supply Day (e.g. Tuesday)"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors"
            >
              Save Wholesaler
            </button>
          </form>
        </div>
      )}

      {/* Accounts List */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
        <h3 className="font-black text-sm text-slate-800">Payables Ledger ({filteredList.length})</h3>

        <div className="divide-y divide-slate-100">
          {filteredList.length > 0 ? (
            filteredList.map(w => {
              const isPaid = w.remaining_balance <= 0;
              const { totalBill: lifetimeBill, totalPaid } = getWholesalerLifetimeTotals(w);
              return (
                <div key={w.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  {/* Info Column */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="text-sm font-black text-slate-900">{w.customer_name}</b>
                      {w.invoice_number && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold">
                          Inv: {w.invoice_number}
                        </span>
                      )}
                      {w.agency_dealer_number && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {w.supplier_number ? `Agency: ${w.agency_dealer_number}` : w.agency_dealer_number}
                        </span>
                      )}
                      {w.supplier_number && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          Supplier: {w.supplier_number}
                        </span>
                      )}
                    </div>

                    <div className="text-slate-500 text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>Total Bill: <b className="font-mono text-slate-700">Rs. {lifetimeBill.toLocaleString()}</b></span>
                      {totalPaid > 0 && (
                        <span className="text-emerald-700 font-semibold">
                          | Ada Kiya: <b className="font-mono">Rs. {totalPaid.toLocaleString()}</b>
                        </span>
                      )}
                      <span>| Date: {w.created_date}</span>
                    </div>

                    {(w.order_day || w.supply_day) && (
                      <div className="text-sky-700 text-[11px] flex items-center gap-1 font-medium">
                        <Calendar className="w-3 h-3" />
                        <span>Order: {w.order_day || '-'} | Supply: {w.supply_day || '-'}</span>
                      </div>
                    )}

                    <div>
                      {isPaid ? (
                        <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 text-[11px]">
                          <CheckCircle className="w-3 h-3" /> Rs. 0 (Nil / Clear)
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold text-xs">
                          Baqi Dena Hai: <b className="font-mono text-sm">Rs. {w.remaining_balance.toLocaleString()}</b>
                        </span>
                      )}
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-3 pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => openEditWholesalerModal(w)}
                        className="text-blue-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementWholesaler(w)}
                        className="text-purple-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <History className="w-3 h-3" /> History
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintReceiptBill(w)}
                        className="text-slate-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Printer className="w-3 h-3" /> Slip
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(w.id)}
                        className="text-rose-500 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Payment & Add Bill Controls */}
                  <div className="sm:w-48 space-y-2 shrink-0 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {/* Pay Form */}
                    <div className="flex gap-1.5">
                      <AmountInput
                        placeholder="Raqam"
                        value={payInputs[w.id] ?? (isPaid ? '' : w.remaining_balance.toString())}
                        onValueChange={val => setPayInputs(prev => ({ ...prev, [w.id]: val }))}
                        disabled={isPaid}
                        className="w-24 p-1.5 bg-white border border-slate-300 rounded-lg text-center font-bold text-xs"
                      />
                      <button
                        type="button"
                        disabled={isPaid}
                        onClick={() => handlePay(w)}
                        className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                          isPaid ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        PAY
                      </button>
                    </div>

                    {/* Add New Bill Form */}
                    <div className="flex gap-1.5">
                      <AmountInput
                        placeholder="Naya Bill"
                        value={addBillInputs[w.id] || ''}
                        onValueChange={val => setAddBillInputs(prev => ({ ...prev, [w.id]: val }))}
                        className="w-24 p-1.5 bg-white border border-blue-300 rounded-lg text-center font-bold text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddNewBill(w)}
                        className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors"
                      >
                        ADD
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              No matching wholesaler records found!
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal — Exact same Wholesaler fields & clean aligned layout as Add Wholesaler Form */}
      {editItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={e => {
            if (e.target === e.currentTarget) setEditItem(null);
          }}
        >
          <div className="bg-white text-slate-800 w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-100 space-y-3.5 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-slate-900">
                Wholesaler Khata Edit Karein
              </h3>
              <button
                type="button"
                onClick={() => setEditItem(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Wholesaler / Company Name
                </label>
                <input
                  type="text"
                  name="edit_wholesaler_name"
                  list="nh-wholesaler-suggestions"
                  autoComplete="on"
                  value={editItem.customer_name}
                  onChange={e => setEditItem({ ...editItem, customer_name: e.target.value })}
                  placeholder="Wholesaler / Company Name"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 items-end">
                <div className="flex flex-col">
                  <label className="min-h-[28px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Total Bill (Rs.)
                  </label>
                  <AmountInput
                    value={editBillStr}
                    onValueChange={val => setEditBillStr(sanitizeNumberInput(val))}
                    onFocus={e => {
                      if (e.target.value === '0') {
                        setEditBillStr('');
                      } else {
                        e.target.select();
                      }
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="min-h-[28px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Baqi Dene Wali Rakam (Rs.)
                  </label>
                  <AmountInput
                    value={editRemainingStr}
                    onValueChange={val => setEditRemainingStr(sanitizeNumberInput(val))}
                    onFocus={e => {
                      if (e.target.value === '0') {
                        setEditRemainingStr('');
                      } else {
                        e.target.select();
                      }
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px]">
                <span className="font-semibold text-slate-600">Total Ada Kiya (Paid):</span>
                <span className="font-mono font-black text-emerald-700">
                  Rs.{' '}
                  {Math.max(
                    0,
                    (parseFloat(editBillStr || '0') || 0) - (parseFloat(editRemainingStr || '0') || 0)
                  ).toLocaleString()}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-2.5 grid grid-cols-2 gap-2.5 items-end">
                <div className="flex flex-col">
                  <label className="min-h-[24px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={editItem.invoice_number || ''}
                    onChange={e => setEditItem({ ...editItem, invoice_number: e.target.value })}
                    placeholder="e.g. PEP-101"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="min-h-[24px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Entry Date (تاریخ)
                  </label>
                  <input
                    type="date"
                    value={editItem.created_date || ''}
                    onChange={e => setEditItem({ ...editItem, created_date: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 items-end">
                <div className="flex flex-col">
                  <label className="min-h-[28px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Agency/Dealer Phone No
                  </label>
                  <input
                    type="text"
                    value={editItem.agency_dealer_number || ''}
                    onChange={e => setEditItem({ ...editItem, agency_dealer_number: e.target.value })}
                    placeholder="Agency/Dealer Phone"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="min-h-[28px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Supplier Phone No
                  </label>
                  <input
                    type="text"
                    value={editItem.supplier_number || ''}
                    onChange={e => setEditItem({ ...editItem, supplier_number: e.target.value })}
                    placeholder="Supplier Phone"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 items-end">
                <div className="flex flex-col">
                  <label className="min-h-[24px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Order Day
                  </label>
                  <input
                    type="text"
                    value={editItem.order_day || ''}
                    onChange={e => setEditItem({ ...editItem, order_day: e.target.value })}
                    placeholder="e.g. Monday"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="min-h-[24px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Supply Day
                  </label>
                  <input
                    type="text"
                    value={editItem.supply_day || ''}
                    onChange={e => setEditItem({ ...editItem, supply_day: e.target.value })}
                    placeholder="e.g. Tuesday"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  Tabdeeli Save Karein
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statement History Modal */}
      {statementWholesaler && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={e => {
            if (e.target === e.currentTarget) setStatementWholesaler(null);
          }}
        >
          <div className="bg-white text-slate-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-sm text-slate-800">
                  History Ledger: {statementWholesaler.customer_name}
                </h3>
                <p className="text-[11px] text-slate-500">Party Type: Wholesaler</p>
              </div>
              <button
                type="button"
                onClick={() => setStatementWholesaler(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const { totalBill: lifetimeBill, totalPaid, remaining } =
                getWholesalerLifetimeTotals(statementWholesaler);
              return (
                <div className="p-3 bg-slate-50 my-3 rounded-xl grid grid-cols-3 gap-2 text-center text-xs border border-slate-200/70">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">Total Bill</div>
                    <div className="font-mono font-black text-slate-900">Rs. {lifetimeBill.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">Ada Kiya</div>
                    <div className="font-mono font-black text-emerald-700">Rs. {totalPaid.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">Baqi Dena Hai</div>
                    <div className="font-mono font-black text-rose-600">Rs. {remaining.toLocaleString()}</div>
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto space-y-2 text-xs divide-y divide-slate-100 pr-1">
              {(() => {
                const wholesalerTxs = dailyTransactions.filter(
                  t => t.bill_id === statementWholesaler.id && t.party_type === 'wholesaler'
                );

                if (wholesalerTxs.length === 0) {
                  return (
                    <div className="pt-2 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-800">
                          {statementWholesaler.total_bill === 0
                            ? 'Khata Started (Opening Balance: Rs. 0)'
                            : 'Opening Bill / Payable'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {statementWholesaler.created_date} | Khata Created
                        </div>
                      </div>
                      <div className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        Rs. {statementWholesaler.total_bill.toLocaleString()}
                      </div>
                    </div>
                  );
                }

                return wholesalerTxs.map(tx => (
                  <div key={tx.id} className="pt-2 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-800">{tx.description}</div>
                      <div className="text-[10px] text-slate-400">{tx.transaction_date} | By: {tx.created_by_name || tx.created_by}</div>
                    </div>
                    <div>
                      {tx.amount === 0 ? (
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          Rs. 0 (Opening)
                        </span>
                      ) : (
                        <div className={`font-mono font-bold ${tx.type === 'out' ? 'text-emerald-600' : 'text-blue-600'}`}>
                          {tx.type === 'out' ? 'Paid: -' : 'Added: +'} Rs. {tx.amount.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="pt-3.5 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Download Format
                </span>
                {exportStatusMsg && (
                  <span className="text-[11px] font-bold text-emerald-600 animate-in fade-in">
                    {exportStatusMsg}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadLedgerAsPdf(buildWholesalerLedgerExportPayload(statementWholesaler));
                    triggerExportFeedback('✓ PDF Downloaded!');
                  }}
                  className="py-2.5 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer active:scale-95"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    downloadLedgerAsJpg(buildWholesalerLedgerExportPayload(statementWholesaler));
                    triggerExportFeedback('✓ JPG Downloaded!');
                  }}
                  className="py-2.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer active:scale-95"
                >
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>JPG</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await shareLedgerOnWhatsApp(buildWholesalerLedgerExportPayload(statementWholesaler));
                    triggerExportFeedback('✓ Ready on WhatsApp!');
                  }}
                  className="py-2.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer active:scale-95"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">Share WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Thermal Slip Modal */}
      {printReceiptBill && (() => {
        const { totalBill: lifetimeBill, totalPaid, remaining } =
          getWholesalerLifetimeTotals(printReceiptBill);
        return (
          <PrintReceiptModal
            isOpen={true}
            onClose={() => setPrintReceiptBill(null)}
            billNumber={printReceiptBill.invoice_number || `WH-${printReceiptBill.id}`}
            customerName={printReceiptBill.customer_name}
            items={[{ name: `Wholesaler Stock Bill`, price: lifetimeBill, qty: 1 }]}
            totalAmount={lifetimeBill}
            paidAmount={totalPaid}
            remainingBalance={remaining}
          />
        );
      })()}
    </div>
  );
};

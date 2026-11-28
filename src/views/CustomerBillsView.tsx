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
  Phone,
  MapPin,
  Printer,
  Image as ImageIcon,
  MessageCircle,
  X
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { CustomerBill } from '../types/pos';
import { PrintReceiptModal } from '../components/PrintReceiptModal';
import { showAppAlert, showAppConfirm } from '../components/AppDialogHost';
import { AmountInput } from '../components/AmountInput';
import { StickyPageHeader } from '../components/StickyPageHeader';
import { superAdminService } from '../superadmin/superAdminService';
import {
  LedgerExportPayload,
  downloadLedgerAsJpg,
  downloadLedgerAsPdf,
  shareLedgerOnWhatsApp
} from '../utils/ledgerExport';

export const CustomerBillsView: React.FC = () => {
  const {
    currentUser,
    currentShop,
    customers,
    addCustomer,
    receiveCustomerPayment,
    payMoreCustomer,
    updateCustomer,
    deleteCustomer,
    getTotalCustomerReceivable,
    dailyTransactions,
    setActiveView
  } = usePOS();

  const userWithShop = { ...currentUser, shopId: currentShop?.id || currentUser?.shopId };

  const [search, setSearch] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // New Customer Form State
  const [name, setName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [invNum, setInvNum] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [orderDay, setOrderDay] = useState<string>('');
  const [supplyDay, setSupplyDay] = useState<string>('');

  // Per row input amounts
  const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>({});
  const [payMoreInputs, setPayMoreInputs] = useState<Record<string, string>>({});

  // Edit Modal
  const [editItem, setEditItem] = useState<CustomerBill | null>(null);
  const [editBillStr, setEditBillStr] = useState<string>('');
  const [editRemainingStr, setEditRemainingStr] = useState<string>('');

  const sanitizeNumberInput = (rawVal: string): string => {
    if (rawVal === '') return '';
    if (rawVal.length > 1 && rawVal.startsWith('0') && rawVal[1] !== '.') {
      return rawVal.replace(/^0+/, '') || '0';
    }
    return rawVal;
  };

  // Compute true cumulative lifetime totals (combining stored totals + linked customer daily transactions)
  const getCustomerLifetimeTotals = (c: CustomerBill) => {
    const linkedTxs = dailyTransactions.filter(
      t => t.bill_id === c.id && t.party_type === 'customer'
    );
    const txOutSum = linkedTxs
      .filter(t => t.type === 'out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const txInSum = linkedTxs
      .filter(t => t.type === 'in')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const remaining = Math.max(0, Number(c.remaining_balance) || 0);
    const storedTotal = Math.max(0, Number(c.total_bill) || 0);
    const storedReceived = Math.max(0, Number(c.total_received) || 0);

    const totalReceived = Math.max(
      storedReceived,
      txInSum,
      Math.max(0, storedTotal - remaining)
    );
    const totalGiven = Math.max(
      storedTotal,
      txOutSum,
      totalReceived + remaining
    );

    return { totalGiven, totalReceived, remaining };
  };

  const openEditCustomerModal = (c: CustomerBill) => {
    if (!superAdminService.isActionUnlockedForUser('allowManageBills', userWithShop)) {
      showAppAlert('🔒 کسٹمر کھاتہ ایڈٹ کرنے کی اجازت فی الحال لاک (Locked) ہے۔');
      return;
    }
    const { totalGiven, totalReceived, remaining } = getCustomerLifetimeTotals(c);
    setEditItem({
      ...c,
      total_bill: totalGiven,
      total_received: totalReceived,
      remaining_balance: remaining
    });
    setEditBillStr(totalGiven.toString());
    setEditRemainingStr(remaining.toString());
  };

  // Statement Ledger Modal & Slip Modal
  const [statementCustomer, setStatementCustomer] = useState<CustomerBill | null>(null);
  const [printReceiptBill, setPrintReceiptBill] = useState<CustomerBill | null>(null);
  const [exportStatusMsg, setExportStatusMsg] = useState<string | null>(null);

  const buildCustomerLedgerExportPayload = (c: CustomerBill): LedgerExportPayload => {
    const { totalGiven, totalReceived, remaining } = getCustomerLifetimeTotals(c);
    const linkedTxs = dailyTransactions.filter(
      t => t.bill_id === c.id && t.party_type === 'customer'
    );
    const entries =
      linkedTxs.length > 0
        ? linkedTxs.map(tx => ({
            description: tx.description,
            date: tx.transaction_date,
            by: tx.created_by_name || tx.created_by,
            type: tx.amount === 0 ? 'opening' : tx.type,
            amount: Number(tx.amount) || 0
          }))
        : [
            {
              description:
                totalGiven === 0
                  ? 'Khata Started (Opening Balance: Rs. 0)'
                  : 'Opening Bill / Credit',
              date: c.created_date,
              type: 'opening',
              amount: totalGiven
            }
          ];

    return {
      shopName: currentShop?.shop_name || currentUser?.shopName || 'NH POS Shop',
      shopPhone: currentShop?.phone,
      partyTypeLabel: 'Customer',
      partyName: c.customer_name,
      partyPhone: c.phone_number,
      invoiceNumber: c.invoice_number,
      address: c.address,
      totalGivenLabel: 'Total Diya',
      totalReceivedLabel: 'Wapas Mila',
      remainingLabel: 'Baqi Lena Hai',
      totalGiven,
      totalReceived,
      remaining,
      entries
    };
  };

  const triggerExportFeedback = (msg: string) => {
    setExportStatusMsg(msg);
    setTimeout(() => setExportStatusMsg(null), 2600);
  };

  const totalReceivable = getTotalCustomerReceivable();
  const totalCount = customers.length;
  const activeCount = customers.filter(c => c.remaining_balance > 0).length;
  const inactiveCount = customers.filter(c => c.remaining_balance <= 0).length;

  const filteredList = customers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.customer_name.toLowerCase().includes(q) ||
      (c.phone_number && c.phone_number.toLowerCase().includes(q)) ||
      (c.invoice_number && c.invoice_number.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      c.remaining_balance.toString().includes(q)
    );
  });

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showAppAlert('Customer ka naam likhna zaroori hai!');
      return;
    }

    // Amount can be 0 or empty (defaults to 0 as requested)
    const val = amount.trim() === '' ? 0 : parseFloat(amount);
    if (isNaN(val) || val < 0) {
      showAppAlert('Baraye meharbani durust raqam (0 ya us se zyada) darj karein!');
      return;
    }

    addCustomer({
      customer_name: trimmedName,
      total_bill: val,
      invoice_number: invNum.trim() || undefined,
      phone_number: phone.trim() || undefined,
      address: address.trim() || undefined,
      order_day: orderDay.trim() || undefined,
      supply_day: supplyDay.trim() || undefined
    });

    setName('');
    setAmount('');
    setInvNum('');
    setPhone('');
    setAddress('');
    setOrderDay('');
    setSupplyDay('');
    setShowAddForm(false);
  };

  const handleReceive = async (bill: CustomerBill) => {
    if (!superAdminService.isActionUnlockedForUser('allowManageBills', userWithShop)) {
      showAppAlert('🔒 کسٹمر وصولی ریکارڈ کرنے کی اجازت فی الحال لاک (Locked) ہے۔');
      return;
    }
    const inputVal = receiveInputs[bill.id] !== undefined ? parseFloat(receiveInputs[bill.id]) : bill.remaining_balance;
    if (isNaN(inputVal) || inputVal <= 0) {
      showAppAlert('Please enter a valid payment amount!');
      return;
    }
    if (inputVal > bill.remaining_balance) {
      showAppAlert('Payment cannot exceed remaining balance!');
      return;
    }

    const confirmed = await showAppConfirm({
      title: 'Confirm Payment Receipt',
      message: `Record receipt of Rs. ${inputVal.toLocaleString()} from ${bill.customer_name}?`,
      confirmText: 'Record Receipt',
      variant: 'primary'
    });
    if (confirmed) {
      receiveCustomerPayment(bill.id, inputVal);
      setReceiveInputs(prev => ({ ...prev, [bill.id]: '' }));
    }
  };

  const handlePayMore = (bill: CustomerBill) => {
    const inputVal = parseFloat(payMoreInputs[bill.id]);
    if (isNaN(inputVal) || inputVal <= 0) {
      showAppAlert('Please enter credit amount!');
      return;
    }

    payMoreCustomer(bill.id, inputVal);
    setPayMoreInputs(prev => ({ ...prev, [bill.id]: '' }));
  };

  const handleDelete = async (id: string) => {
    if (!superAdminService.isActionUnlockedForUser('allowDeleteEntry', userWithShop)) {
      showAppAlert('🔒 کسٹمر کھاتہ ڈیلیٹ کرنے کی اجازت فی الحال لاک (Locked) ہے۔');
      return;
    }
    const confirmed = await showAppConfirm({
      title: 'Delete Customer Record',
      message: 'Are you sure you want to delete this customer record?',
      confirmText: 'Delete',
      variant: 'danger'
    });
    if (confirmed) {
      deleteCustomer(id);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;

    const trimmedName = editItem.customer_name?.trim();
    if (!trimmedName) {
      showAppAlert('Customer ka naam zaroori hai!');
      return;
    }

    const rawTotalBillVal = editBillStr.trim() === '' ? 0 : parseFloat(editBillStr);
    const remainingVal = editRemainingStr.trim() === '' ? 0 : parseFloat(editRemainingStr);

    if (isNaN(rawTotalBillVal) || rawTotalBillVal < 0 || isNaN(remainingVal) || remainingVal < 0) {
      showAppAlert('Baraye meharbani durust raqam (0 ya us se zyada) darj karein!');
      return;
    }

    // If user increased Remaining Balance without bumping Total Di Gayi Rakam, keep Total Di Gayi Rakam >= Remaining Balance
    const prevRem = Math.max(0, Number(editItem.remaining_balance) || 0);
    const prevReceived = Math.max(0, Number(editItem.total_received) || 0);
    const totalBillVal =
      remainingVal > prevRem
        ? Math.max(rawTotalBillVal, remainingVal + prevReceived)
        : Math.max(rawTotalBillVal, remainingVal);

    const updatedCustomer: CustomerBill = {
      ...editItem,
      customer_name: trimmedName,
      total_bill: totalBillVal,
      total_received: Math.max(0, totalBillVal - remainingVal),
      remaining_balance: remainingVal,
      invoice_number: editItem.invoice_number?.trim() || undefined,
      phone_number: editItem.phone_number?.trim() || undefined,
      address: editItem.address?.trim() || undefined,
      order_day: editItem.order_day?.trim() || undefined,
      supply_day: editItem.supply_day?.trim() || undefined,
      status: remainingVal <= 0 ? 'paid' : 'pending'
    };

    updateCustomer(updatedCustomer);
    setEditItem(null);
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Sticky Top Header (Shrinks 50% with frosted glass on scroll) */}
      <StickyPageHeader
        title="Customer Credit Ledger"
        onBack={() => setActiveView('dashboard')}
      />

      {/* Emerald Box Banner matching PHP #407a22 */}
      <div className="bg-[#407a22] text-white p-4 sm:p-5 rounded-2xl shadow-md flex items-center justify-between">
        <div className="space-y-0.5 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 opacity-80" />
            <span>Total: {totalCount}</span>
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
            Rs. {totalReceivable.toLocaleString()}
          </h2>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider opacity-90">
            TOTAL RECEIVABLE
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-emerald-500 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, amount, or invoice..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-emerald-500 rounded-xl font-medium text-xs shadow-xs focus:outline-none focus:border-emerald-600"
        />
      </div>

      {/* Toggle Add Customer Button */}
      <button
        type="button"
        onClick={() => setShowAddForm(prev => !prev)}
        className="w-full py-3 bg-[#1e293b] hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <PlusCircle className="w-4 h-4 text-emerald-400" />
        <span>{showAddForm ? '× Form Band Karein' : '+ Add New Customer Bill'}</span>
      </button>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 space-y-3.5 animate-in fade-in duration-200">
          <h3 className="font-black text-sm sm:text-base text-slate-900 text-center">
            Customer Ko Rakam Dene ki Tafseel
          </h3>
          <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
            <input
              type="text"
              name="customer_name"
              list="nh-customer-suggestions"
              autoComplete="on"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Customer Ka Naam *"
              required
              className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-xl font-semibold text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <AmountInput
              value={amount}
              onValueChange={setAmount}
              placeholder="Rakam (Amount) Jo Di Hai *"
              className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-xl font-bold text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
            />

            <div className="border-t border-dashed border-slate-200 pt-2.5 text-[11px] text-slate-500 font-bold">
              Optional Details (Zaroori Nahi Hain):
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={invNum}
                onChange={e => setInvNum(e.target.value)}
                placeholder="Invoice Number"
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Phone Number"
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Customer Ka Pata (Address)"
              rows={2}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:border-emerald-500"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={orderDay}
                  onChange={e => setOrderDay(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Return Date</label>
                <input
                  type="date"
                  value={supplyDay}
                  onChange={e => setSupplyDay(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Khata Save Karein
            </button>
          </form>
        </div>
      )}

      {/* Customers List */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
        <h3 className="font-black text-sm text-slate-800">Receivables Ledger ({filteredList.length})</h3>

        <div className="divide-y divide-slate-100">
          {filteredList.length > 0 ? (
            filteredList.map(c => {
              const isPaid = c.remaining_balance <= 0;
              return (
                <div key={c.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  {/* Info Column */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="text-sm font-black text-slate-900">{c.customer_name}</b>
                      {c.phone_number && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5" /> {c.phone_number}
                        </span>
                      )}
                    </div>

                    {(() => {
                      const { totalGiven, totalReceived } = getCustomerLifetimeTotals(c);
                      return (
                        <div className="text-slate-500 text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>
                            Total Diya: <b className="font-mono text-slate-700">Rs. {totalGiven.toLocaleString()}</b>
                          </span>
                          <span>|</span>
                          <span>
                            Wapas Mila: <b className="font-mono text-emerald-700">Rs. {totalReceived.toLocaleString()}</b>
                          </span>
                          <span>|</span>
                          <span>Date: {c.created_date}</span>
                        </div>
                      );
                    })()}

                    {c.invoice_number && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold">
                        Inv: {c.invoice_number}
                      </span>
                    )}

                    {c.address && (
                      <div className="text-slate-500 text-[11px] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{c.address}</span>
                      </div>
                    )}

                    {(c.order_day || c.supply_day) && (
                      <div className="text-blue-600 text-[11px] flex items-center gap-1 font-medium">
                        <Calendar className="w-3 h-3" />
                        <span>Payment: {c.order_day || '-'} | Return: {c.supply_day || '-'}</span>
                      </div>
                    )}

                    <div>
                      {isPaid ? (
                        <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 text-[11px]">
                          <CheckCircle className="w-3 h-3" /> Rs. 0 (Nil / Clear)
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold text-xs">
                          Baqi Lena Hai: <b className="font-mono text-sm">Rs. {c.remaining_balance.toLocaleString()}</b>
                        </span>
                      )}
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-3 pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => openEditCustomerModal(c)}
                        className="text-blue-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementCustomer(c)}
                        className="text-purple-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <History className="w-3 h-3" /> History
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintReceiptBill(c)}
                        className="text-slate-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Printer className="w-3 h-3" /> Slip
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="text-rose-500 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Payment & Pay More Controls */}
                  <div className="sm:w-52 space-y-2 shrink-0 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {/* Receive Payment Form */}
                    <div className="flex gap-1.5">
                      <AmountInput
                        placeholder="Raqam"
                        value={receiveInputs[c.id] ?? (isPaid ? '' : c.remaining_balance.toString())}
                        onValueChange={val => setReceiveInputs(prev => ({ ...prev, [c.id]: val }))}
                        disabled={isPaid}
                        className="w-24 p-1.5 bg-white border border-slate-300 rounded-lg text-center font-bold text-xs"
                      />
                      <button
                        type="button"
                        disabled={isPaid}
                        onClick={() => handleReceive(c)}
                        className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                          isPaid ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        Receive
                      </button>
                    </div>

                    {/* Additional Credit Form */}
                    <div className="flex gap-1.5">
                      <AmountInput
                        placeholder="New Bill"
                        value={payMoreInputs[c.id] || ''}
                        onValueChange={val => setPayMoreInputs(prev => ({ ...prev, [c.id]: val }))}
                        className="w-24 p-1.5 bg-white border border-blue-300 rounded-lg text-center font-bold text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handlePayMore(c)}
                        className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors"
                      >
                        Pay
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              No matching customer records found!
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal — Exact same fields & layout as Add Customer Form */}
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
                Customer Khata Edit Karein
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
                  Customer Ka Naam
                </label>
                <input
                  type="text"
                  name="edit_customer_name"
                  list="nh-customer-suggestions"
                  autoComplete="on"
                  value={editItem.customer_name}
                  onChange={e => setEditItem({ ...editItem, customer_name: e.target.value })}
                  placeholder="Customer Ka Naam"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 items-end">
                <div className="flex flex-col">
                  <label className="min-h-[28px] flex items-end text-[11px] font-bold text-slate-600 mb-1 leading-tight">
                    Total Di Gayi Rakam (Rs.)
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
                    Baqi Lene Wali Rakam (Rs.)
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
                <span className="font-semibold text-slate-600">Total Wapas Mili (Received):</span>
                <span className="font-mono font-black text-emerald-700">
                  Rs.{' '}
                  {Math.max(
                    0,
                    (parseFloat(editBillStr || '0') || 0) - (parseFloat(editRemainingStr || '0') || 0)
                  ).toLocaleString()}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-2.5 grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={editItem.invoice_number || ''}
                    onChange={e => setEditItem({ ...editItem, invoice_number: e.target.value })}
                    placeholder="Invoice Number"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={editItem.phone_number || ''}
                    onChange={e => setEditItem({ ...editItem, phone_number: e.target.value })}
                    placeholder="Phone Number"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Address
                </label>
                <textarea
                  value={editItem.address || ''}
                  onChange={e => setEditItem({ ...editItem, address: e.target.value })}
                  placeholder="Customer Ka Pata (Address)"
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 resize-none focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={editItem.order_day || ''}
                    onChange={e => setEditItem({ ...editItem, order_day: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Return Date
                  </label>
                  <input
                    type="date"
                    value={editItem.supply_day || ''}
                    onChange={e => setEditItem({ ...editItem, supply_day: e.target.value })}
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
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white text-slate-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-sm text-slate-800">
                  History Ledger: {statementCustomer.customer_name}
                </h3>
                <p className="text-[11px] text-slate-500">Party Type: Customer</p>
              </div>
              <button
                type="button"
                onClick={() => setStatementCustomer(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const { totalGiven, totalReceived, remaining } = getCustomerLifetimeTotals(statementCustomer);
              return (
                <div className="p-3 bg-slate-50 my-3 rounded-xl grid grid-cols-3 gap-2 text-center text-xs border border-slate-200/70">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">Total Diya</div>
                    <div className="font-mono font-black text-slate-900">Rs. {totalGiven.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">Wapas Mila</div>
                    <div className="font-mono font-black text-emerald-700">Rs. {totalReceived.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">Baqi Lena Hai</div>
                    <div className="font-mono font-black text-rose-600">Rs. {remaining.toLocaleString()}</div>
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto space-y-2 text-xs divide-y divide-slate-100 pr-1">
              {(() => {
                const customerTxs = dailyTransactions.filter(
                  t => t.bill_id === statementCustomer.id && t.party_type === 'customer'
                );

                if (customerTxs.length === 0) {
                  return (
                    <div className="pt-2 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-800">
                          {statementCustomer.total_bill === 0
                            ? 'Khata Started (Opening Balance: Rs. 0)'
                            : 'Opening Bill / Credit'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {statementCustomer.created_date} | Khata Created
                        </div>
                      </div>
                      <div className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        Rs. {statementCustomer.total_bill.toLocaleString()}
                      </div>
                    </div>
                  );
                }

                return customerTxs.map(tx => (
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
                        <div className={`font-mono font-bold ${tx.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'in' ? 'Received: -' : 'Given: +'} Rs. {tx.amount.toLocaleString()}
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
                    downloadLedgerAsPdf(buildCustomerLedgerExportPayload(statementCustomer));
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
                    downloadLedgerAsJpg(buildCustomerLedgerExportPayload(statementCustomer));
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
                    await shareLedgerOnWhatsApp(buildCustomerLedgerExportPayload(statementCustomer));
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
      {printReceiptBill && (
        <PrintReceiptModal
          isOpen={true}
          onClose={() => setPrintReceiptBill(null)}
          billNumber={printReceiptBill.invoice_number || `CUST-${printReceiptBill.id}`}
          customerName={printReceiptBill.customer_name}
          items={[{ name: `Customer Credit Bill`, price: printReceiptBill.total_bill, qty: 1 }]}
          totalAmount={printReceiptBill.total_bill}
          paidAmount={printReceiptBill.total_bill - printReceiptBill.remaining_balance}
          remainingBalance={printReceiptBill.remaining_balance}
        />
      )}
    </div>
  );
};

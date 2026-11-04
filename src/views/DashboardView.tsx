/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Wallet,
  Building2,
  Smartphone,
  Wine,
  Tags,
  Truck,
  Users,
  ShoppingCart,
  TrendingUp,
  Eye,
  EyeOff,
  Calendar,
  ArrowRight,
  UserCheck,
  ShieldCheck
} from 'lucide-react';
import { usePOS, ActiveView } from '../context/POSContext';
import { superAdminService } from '../superadmin/superAdminService';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    currentShop,
    filterDate,
    setFilterDate,
    isPrivacyOn,
    togglePrivacy,
    setActiveView,
    getShopCashStats,
    getBackCashTotal,
    getEasyloadSaleSummary,
    getBachatProfit,
    getRemainingPets,
    getTotalWholesalerPayable,
    getTotalCustomerReceivable
  } = usePOS();

  const shopCash = getShopCashStats(filterDate);
  const backCash = getBackCashTotal(filterDate);
  const loadSummary = getEasyloadSaleSummary(filterDate);
  const bachat = getBachatProfit(filterDate);
  const totalPets = getRemainingPets();
  const totalPayable = getTotalWholesalerPayable();
  const totalReceivable = getTotalCustomerReceivable();

  const fmt = (val: number) => (isPrivacyOn ? '••••••' : `Rs. ${Math.round(val).toLocaleString()}`);

  const isVerifiedSuperAdmin = Boolean(
    currentUser?.role === 'super_admin' &&
    superAdminService.isMasterAdminEmail(currentUser?.email)
  );
  const isStoreAdmin = Boolean(currentUser?.isGoogleUser || currentUser?.role === 'admin' || isVerifiedSuperAdmin);

  const cards: Array<{
    id: ActiveView;
    title: string;
    urdu: string;
    value: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }> = [
    {
      id: 'daily_cash',
      title: 'Daily Cash Book',
      urdu: 'روزانہ گلہ کیش بک',
      value: fmt(shopCash.balance),
      sub: `In: ${fmt(shopCash.cashIn)} | Out: ${fmt(shopCash.cashOut)}`,
      icon: Wallet,
      color: 'from-blue-600 to-indigo-700'
    },
    {
      id: 'back_cash',
      title: 'Back Cash Manager',
      urdu: 'بیک کیش ریزرو کھاتہ',
      value: fmt(backCash),
      sub: 'Safe Reserve & Transfers',
      icon: Building2,
      color: 'from-slate-700 to-slate-900'
    },
    {
      id: 'easyload',
      title: 'Easy Load Ledger',
      urdu: 'ایزی لوڈ کھاتہ',
      value: fmt(loadSummary.total),
      sub: 'Jazz • Telenor • Zong • Ufone',
      icon: Smartphone,
      color: 'from-emerald-600 to-teal-700'
    },
    {
      id: 'pos',
      title: 'POS Sale Counter',
      urdu: 'پی او ایس بلنگ کاؤنٹر',
      value: 'Quick Billing',
      sub: 'Cart & Receipt Counter',
      icon: ShoppingCart,
      color: 'from-amber-500 to-orange-600'
    },
    {
      id: 'customer',
      title: 'Customer Khata (Udhaar)',
      urdu: 'کسٹمر ادھار کھاتہ',
      value: fmt(totalReceivable),
      sub: 'Pending Customer Receivables',
      icon: Users,
      color: 'from-purple-600 to-indigo-700'
    },
    {
      id: 'wholesaler',
      title: 'Wholesaler Ledger',
      urdu: 'ہول سیلر ایجنسی کھاتہ',
      value: fmt(totalPayable),
      sub: 'Dealer & Agency Payables',
      icon: Truck,
      color: 'from-rose-600 to-pink-700'
    },
    {
      id: 'bottle_stock',
      title: 'Bottle & Pet Stock',
      urdu: 'بوتل اور کریٹ اسٹاک',
      value: `${totalPets} Units`,
      sub: 'Inventory & Stock Movement',
      icon: Wine,
      color: 'from-cyan-600 to-blue-700'
    },
    {
      id: 'items_price',
      title: 'Items Price List',
      urdu: 'اشیاء کی قیمتیں',
      value: 'Catalog',
      sub: 'Retail & Wholesale Rates',
      icon: Tags,
      color: 'from-teal-600 to-emerald-700'
    },
    {
      id: 'monthly_summary',
      title: 'Monthly Cash & Profit',
      urdu: 'ماہانہ خلاصہ اور بچت',
      value: fmt(bachat.totalNetBachat),
      sub: 'Net Profit & Commission',
      icon: TrendingUp,
      color: 'from-indigo-600 to-violet-700'
    }
  ];

  if (isStoreAdmin) {
    cards.push({
      id: 'staff_management',
      title: 'Staff & User Logins',
      urdu: 'عملہ اور اسٹاف اکاؤنٹس',
      value: 'Manage NH- IDs',
      sub: 'Cashier, Manager & Salesman',
      icon: UserCheck,
      color: 'from-fuchsia-600 to-purple-700'
    });
  }

  const visibleCards = cards.filter(c =>
    superAdminService.isModuleEnabledForShop(c.id, currentUser?.shopId) || isVerifiedSuperAdmin
  );

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">
            {currentShop?.shop_name || currentUser?.shopName || 'NH POS Shop'}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Welcome, <span className="font-bold text-slate-800">{currentUser?.name || currentUser?.username}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={togglePrivacy}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {isPrivacyOn ? <Eye className="w-4 h-4 text-blue-600" /> : <EyeOff className="w-4 h-4 text-slate-600" />}
            <span>{isPrivacyOn ? 'Show Amounts' : 'Hide Amounts'}</span>
          </button>

          {isVerifiedSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveView('super_admin')}
              className="px-3 py-2 bg-indigo-950 hover:bg-indigo-900 text-indigo-200 border border-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Super Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {visibleCards.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveView(card.id)}
              className={`bg-gradient-to-br ${card.color} text-white p-4 rounded-2xl shadow-md hover:shadow-lg transition-all text-left flex flex-col justify-between group cursor-pointer active:scale-98`}
            >
              <div className="flex items-start justify-between w-full">
                <div>
                  <span className="text-[11px] font-bold text-white/80 block">{card.urdu}</span>
                  <h3 className="text-sm font-black tracking-tight">{card.title}</h3>
                </div>
                <div className="p-2.5 bg-white/15 rounded-xl">
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/15 flex items-end justify-between w-full">
                <div>
                  <div className="text-lg font-black font-mono">{card.value}</div>
                  <div className="text-[10px] text-white/75 font-medium">{card.sub}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BottleItem,
  EasyloadRecord,
  DailyTransaction,
  BackCashTransaction,
  WholesalerBill,
  CustomerBill,
  StockTransaction,
  SystemSettings
} from '../types/pos';

export const getTodayDateString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getYesterdayDateString = (fromDate?: string): string => {
  const base = fromDate ? new Date(`${fromDate}T12:00:00`) : new Date();
  base.setDate(base.getDate() - 1);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const today = getTodayDateString();
const yesterday = getYesterdayDateString(today);

export const initialBottleItems: BottleItem[] = [
  { id: 'b-1', item_name: 'Pepsi 1.5L Pet', unit_price: 180, wholesale_price: 165, salesman_price: 170, commission_per_unit: 15, total_stock: 48, category: 'Beverages' },
  { id: 'b-2', item_name: '7Up 1.5L Pet', unit_price: 180, wholesale_price: 165, salesman_price: 170, commission_per_unit: 15, total_stock: 36, category: 'Beverages' },
  { id: 'b-3', item_name: 'Dew 1.5L Pet', unit_price: 180, wholesale_price: 165, salesman_price: 170, commission_per_unit: 15, total_stock: 30, category: 'Beverages' },
  { id: 'b-4', item_name: 'Coca Cola 1.5L', unit_price: 180, wholesale_price: 165, salesman_price: 170, commission_per_unit: 15, total_stock: 42, category: 'Beverages' },
  { id: 'b-5', item_name: 'Sprite 1.5L', unit_price: 180, wholesale_price: 165, salesman_price: 170, commission_per_unit: 15, total_stock: 24, category: 'Beverages' },
  { id: 'b-6', item_name: 'Mineral Water 1.5L', unit_price: 90, wholesale_price: 75, salesman_price: 80, commission_per_unit: 15, total_stock: 60, category: 'Water' }
];

export const initialEasyloadRecords: Record<string, EasyloadRecord> = {
  [yesterday]: {
    date_recorded: yesterday,
    jazz_opening: 15000,
    jazz_purchase: 10000,
    jazz_closing: 8000,
    telenor_opening: 12000,
    telenor_purchase: 5000,
    telenor_closing: 6000,
    zong_opening: 10000,
    zong_purchase: 5000,
    zong_closing: 4500,
    ufone_opening: 5000,
    ufone_purchase: 0,
    ufone_closing: 3000,
    total_commission_earned: 480
  },
  [today]: {
    date_recorded: today,
    jazz_opening: 8000,
    jazz_purchase: 15000,
    jazz_closing: 11500,
    telenor_opening: 6000,
    telenor_purchase: 10000,
    telenor_closing: 7200,
    zong_opening: 4500,
    zong_purchase: 8000,
    zong_closing: 5100,
    ufone_opening: 3000,
    ufone_purchase: 2000,
    ufone_closing: 3400,
    total_commission_earned: 840
  }
};

export const initialDailyTransactions: DailyTransaction[] = [
  {
    id: 'dt-demo-1',
    type: 'opening',
    amount: 45000,
    description: 'آج کا ابتدائی کیش (Opening Galla Balance)',
    transaction_date: today,
    created_by: 'admin',
    created_by_name: 'Admin'
  },
  {
    id: 'dt-demo-2',
    type: 'in',
    amount: 12500,
    description: 'نقد کریانہ و کولڈ ڈرنک سیل (Counter Sale)',
    transaction_date: today,
    created_by: 'admin',
    created_by_name: 'Admin'
  },
  {
    id: 'dt-demo-3',
    type: 'out',
    amount: 5000,
    description: 'پیپسی ایجنسی بل ادائیگی (Wholesaler Payment)',
    transaction_date: today,
    created_by: 'admin',
    created_by_name: 'Admin'
  },
  {
    id: 'dt-demo-4',
    type: 'opening',
    amount: 38000,
    description: 'کل کا ابتدائی کیش (Yesterday Opening)',
    transaction_date: yesterday,
    created_by: 'admin',
    created_by_name: 'Admin'
  }
];

export const initialBackCashTransactions: BackCashTransaction[] = [
  {
    id: 'bc-demo-1',
    type: 'in',
    amount: 80000,
    note: 'بیک کیش ریزرو فنڈ (Safe Reserve Balance)',
    transaction_date: yesterday,
    created_by: 'admin',
    created_by_role: 'admin',
    created_by_name: 'Admin'
  },
  {
    id: 'bc-demo-2',
    type: 'commission',
    amount: 1450,
    note: 'JazzCash / EasyPaisa Sending & Receiving Commission',
    transaction_date: today,
    created_by: 'admin',
    created_by_role: 'admin',
    created_by_name: 'Admin'
  }
];

export const initialWholesalers: WholesalerBill[] = [
  {
    id: 'w-demo-1',
    customer_name: 'Pepsi Cola Agency (Sadiqabad)',
    phone: '0300-1112233',
    total_bill: 45000,
    remaining_balance: 15000,
    created_date: today,
    status: 'pending',
    note: 'Weekly pet crates supply'
  },
  {
    id: 'w-demo-2',
    customer_name: 'Al-Madina Wholesale Traders',
    phone: '0301-4455667',
    total_bill: 30000,
    remaining_balance: 0,
    created_date: yesterday,
    status: 'paid',
    note: 'Grocery items cleared'
  }
];

export const initialCustomers: CustomerBill[] = [
  {
    id: 'c-demo-1',
    customer_name: 'حاجی محمد اکرم (کریانہ کھاتہ)',
    phone: '0302-9988776',
    total_bill: 8500,
    remaining_balance: 3500,
    created_date: today,
    status: 'pending',
    note: 'ماہانہ راشن کھاتہ'
  },
  {
    id: 'c-demo-2',
    customer_name: 'کامران موبائل اینڈ جنرل سٹور',
    phone: '0333-5566778',
    total_bill: 4200,
    remaining_balance: 4200,
    created_date: today,
    status: 'pending',
    note: 'کولڈ ڈرنک کریٹس ادھار'
  }
];

export const initialStockTransactions: StockTransaction[] = [
  {
    id: 'st-demo-1',
    item_id: 'b-1',
    item_name: 'Pepsi 1.5L Pet',
    user_name: 'Admin',
    action_type: 'add',
    quantity: 24,
    note: 'New Agency Stock Received',
    created_at: new Date().toISOString()
  }
];

export const initialSystemSettings: SystemSettings = {
  shopName: 'NH POS Shop',
  ownerName: 'Muhammad Wasi',
  phone: '0334-6800959',
  address: 'Main Bazar, Sadiqabad',
  currency: 'Rs.',
  loadCommissionRate: 2.4,
  shopProfitRate: 8.0
};

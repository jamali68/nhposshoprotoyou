/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'cashier' | 'salesman' | 'user';

export interface User {
  username: string;
  name?: string;
  email?: string;
  role: UserRole;
  isGoogleUser?: boolean;
  isDemo?: boolean;
  shopId: string;
  shopName?: string;
  password?: string;
}

export interface ShopProfile {
  id: string;
  shop_name: string;
  owner_name: string;
  owner_email: string;
  owner_uid: string;
  google_uid?: string;
  google_verified?: boolean;
  google_verified_at?: string;
  password_configured?: boolean;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  isLegacyPassword?: boolean;
  phone?: string;
  address?: string;
  created_at: string;
  last_login?: string;
}

export interface StaffAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'manager' | 'cashier' | 'salesman';
  phone?: string;
  shop_id?: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
}

export interface DailyTransaction {
  id: string;
  type: 'opening' | 'in' | 'out' | 'bill_add';
  amount: number;
  description: string;
  transaction_date: string;
  created_by: string;
  created_by_name?: string;
  created_at?: string;
  party_type?: 'wholesaler' | 'customer';
  bill_id?: string;
  linked_transfer_id?: string;
  transfer_direction?: 'from_back_cash' | 'to_back_cash';
}

export interface BackCashTransaction {
  id: string;
  type: 'in' | 'out' | 'closing' | 'closing_minus' | 'commission' | 'transfer_to_shop' | 'transfer_from_shop';
  amount: number;
  note: string;
  transaction_date: string;
  created_by: string;
  created_by_role?: string;
  created_by_name?: string;
  created_by_designation?: string;
  edited_by?: string;
  edited_by_role?: string;
  edited_by_name?: string;
  edited_at?: string;
  linked_transfer_id?: string;
  transfer_direction?: 'to_shop' | 'from_shop';
}

export interface BackCashClosingBreakdown {
  totalBalance: number;
  activeClosing: number;
  remainingCounter: number;
  userClosings: Array<{
    userId: string;
    userName: string;
    userRole: string;
    amount: number;
  }>;
}

export interface WholesalerBill {
  id: string;
  customer_name: string;
  phone?: string;
  total_bill: number;
  remaining_balance: number;
  created_date: string;
  status: 'pending' | 'paid';
  note?: string;
}

export interface CustomerBill {
  id: string;
  customer_name: string;
  phone?: string;
  total_bill: number;
  remaining_balance: number;
  created_date: string;
  status: 'pending' | 'paid';
  note?: string;
}

export interface EasyloadRecord {
  date_recorded: string;
  jazz_opening: number;
  jazz_purchase: number;
  jazz_closing: number;
  telenor_opening: number;
  telenor_purchase: number;
  telenor_closing: number;
  zong_opening: number;
  zong_purchase: number;
  zong_closing: number;
  ufone_opening: number;
  ufone_purchase: number;
  ufone_closing: number;
  total_commission_earned: number;
}

export interface BottleItem {
  id: string;
  item_name: string;
  unit_price: number;
  wholesale_price?: number;
  salesman_price?: number;
  commission_per_unit: number;
  total_stock: number;
  category?: string;
}

export interface StockTransaction {
  id: string;
  item_id: string;
  item_name: string;
  user_name: string;
  action_type: 'add' | 'remove';
  quantity: number;
  note: string;
  created_at: string;
}

export interface EditHistoryRecord {
  id: string;
  transaction_id: string;
  source: 'shop' | 'back';
  old_amount: number;
  new_amount: number;
  edited_by: string;
  edited_at: string;
  is_read: boolean;
  note: string;
  transaction_date: string;
}

export interface DeletedHistoryRecord {
  id: string;
  original_id: string;
  source: 'shop_cash' | 'back_cash' | 'customer_khata' | 'wholesaler_khata';
  type: string;
  amount: number;
  note: string;
  transaction_date: string;
  deleted_by: string;
  deleted_at: string;
  bill_id?: string;
  party_type?: 'wholesaler' | 'customer';
}

export interface SystemSettings {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  currency: string;
  loadCommissionRate: number;
  shopProfitRate: number;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

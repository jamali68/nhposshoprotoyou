/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SuperAdminSession {
  isAuthenticated: boolean;
  masterEmail: string;
  loginTime: string;
  token?: string;
}

export type ControllableModuleId =
  | 'daily_cash'
  | 'back_cash'
  | 'easyload'
  | 'bottle_stock'
  | 'items_price'
  | 'wholesaler'
  | 'customer'
  | 'pos'
  | 'monthly_summary'
  | 'staff_management'
  | 'deleted_history'
  | 'sql_import'
  | 'backup_restore';

export interface PlatformModuleControlConfig {
  globalModules: Record<string, boolean>; // moduleId -> enabled/disabled globally
  shopOverrides: Record<string, Record<string, boolean>>; // shopId -> { moduleId -> enabled/disabled }
  featurePermissions: {
    allowShopSignup: boolean;
    allowStaffCreation: boolean;
    allowStaffDeleteTransactions: boolean;
    allowDataExport: boolean;
    allowSqlImport: boolean;
    requireStrongPasswords: boolean;
    dataUpdateDelayMs?: number; // Default 1000ms (1 sec) loading wheel delay on add/edit/delete
  };
  updatedAt: string;
  updatedBy: string;
}

export interface TenantShopInfo {
  id: string; // shop ID (usually owner UID)
  shop_name: string;
  owner_name: string;
  owner_email: string;
  phone?: string;
  address?: string;
  created_at: string;
  is_active: boolean;
  total_transactions?: number;
  total_staff?: number;
  last_activity?: string;
  estimated_balance?: number;
  disabled_modules?: string[];
}

export type AuditSeverity = 'info' | 'warn' | 'alert';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  shop_id: string;
  shop_name: string;
  user_name: string;
  user_role: string;
  action: string;
  details: string;
  severity: AuditSeverity;
}

export interface PlatformMetrics {
  totalShops: number;
  activeShopsCount: number;
  suspendedShopsCount: number;
  totalPlatformStaff: number;
  totalTransactionsRecorded: number;
  systemSyncHealth: 'healthy' | 'degraded' | 'offline';
  lastHealthCheck: string;
}

export interface ModuleHealthTestResult {
  moduleId: string;
  moduleName: string;
  category: 'Auth & Security' | 'POS & Ledger' | 'Cloud & Sync' | 'SuperAdmin Control';
  status: 'passed' | 'warning' | 'failed';
  latencyMs: number;
  details: string;
}

export type StaffPermissionActionId =
  | 'allowAddEntry'
  | 'allowEditEntry'
  | 'allowDeleteEntry'
  | 'allowManageBills'
  | 'allowManageStock'
  | 'allowManagePrices';

export interface StaffTargetPermissions {
  modules: Record<string, boolean>; // moduleId -> true (Unlocked) / false (Locked)
  actions: Record<StaffPermissionActionId, boolean>; // actionId -> true (Unlocked) / false (Locked)
}

export interface ShopStaffPermissionsConfig {
  rolePermissions: {
    manager: StaffTargetPermissions;
    cashier: StaffTargetPermissions;
    salesman: StaffTargetPermissions;
  };
  userOverrides: Record<string, StaffTargetPermissions>; // key: lowercase username
  updatedAt: string;
  updatedBy?: string;
}


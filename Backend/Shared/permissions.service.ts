import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';
import {
  UserPermissionsMap,
  UserPermissionsResponse,
  UserRole,
} from './interfaces/user-permissions';

const DEFAULTS: Record<UserRole, UserPermissionsMap> = {
  admin: {
    costsVisible: true,
    canCancelInvoice: true,
    canBackup: true,
    canDeleteCustomer: true,
    canDeleteProduct: true,
    canEditShopSettings: true,
    canManageUsers: true,
    canForfeitSavingScheme: true,
  },
  manager: {
    costsVisible: true,
    canCancelInvoice: true,
    canBackup: false,
    canDeleteCustomer: true,
    canDeleteProduct: true,
    canEditShopSettings: true,
    canManageUsers: false,
    canForfeitSavingScheme: false,
  },
  employee: {
    costsVisible: false,
    canCancelInvoice: false,
    canBackup: false,
    canDeleteCustomer: false,
    canDeleteProduct: false,
    canEditShopSettings: false,
    canManageUsers: false,
    canForfeitSavingScheme: false,
  },
};

@Injectable({
  providedIn: 'root'
})
export class PermissionsService {

  constructor(private databaseService: DatabaseService) {}

  async getUserPermissions(userId: number): Promise<UserPermissionsResponse> {
    const rows = await this.databaseService.execute(
      'call get_user_permissions(?);', [userId]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) {
      throw new Error(`getUserPermissions: user ${userId} not found`);
    }
    return {
      userId: row.userId,
      type: row.type as UserRole,
      permissions: this.parseMap(row.permissions, row.type as UserRole),
      defaultPermissions: this.parseMap(row.defaultPermissions, row.type as UserRole),
    };
  }

  defaultsForRole(role: UserRole): UserPermissionsMap {
    return { ...DEFAULTS[role] };
  }

  private parseMap(raw: any, role: UserRole): UserPermissionsMap {
    const base = DEFAULTS[role] ?? DEFAULTS.employee;
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ...base };
    }
    return {
      costsVisible: this.pick(parsed.costsVisible, base.costsVisible),
      canCancelInvoice: this.pick(parsed.canCancelInvoice, base.canCancelInvoice),
      canBackup: this.pick(parsed.canBackup, base.canBackup),
      canDeleteCustomer: this.pick(parsed.canDeleteCustomer, base.canDeleteCustomer),
      canDeleteProduct: this.pick(parsed.canDeleteProduct, base.canDeleteProduct),
      canEditShopSettings: this.pick(parsed.canEditShopSettings, base.canEditShopSettings),
      canManageUsers: this.pick(parsed.canManageUsers, base.canManageUsers),
      canForfeitSavingScheme: this.pick(parsed.canForfeitSavingScheme, base.canForfeitSavingScheme),
    };
  }

  private pick(candidate: any, fallback: boolean): boolean {
    if (candidate === true || candidate === 1 || candidate === '1') { return true; }
    if (candidate === false || candidate === 0 || candidate === '0') { return false; }
    return fallback;
  }
}

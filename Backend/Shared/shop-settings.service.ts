import { Injectable, inject } from '@angular/core';
import { DatabaseService } from './database.service';
import { ShopSettings } from './interfaces/shop-settings';

@Injectable({
  providedIn: 'root'
})
export class ShopSettingsService {
  private databaseService = inject(DatabaseService);


  get(): Promise<ShopSettings[]> {
    return this.databaseService.query('call get_shop_settings();');
  }

  save(settings: ShopSettings, actorUserId: number | null = null): Promise<ShopSettings[]> {
    return this.databaseService.execute(
      'call save_shop_settings(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [
        settings.shopName,
        settings.gstin,
        settings.pan ?? null,
        settings.addressLine1,
        settings.addressLine2 ?? null,
        settings.city,
        settings.state,
        settings.stateCode,
        settings.pincode,
        settings.phone,
        settings.email ?? null,
        settings.logoPath ?? null,
        settings.invoicePrefix,
        settings.invoiceStartFrom,
        settings.currentInvoiceCounter,
        settings.defaultCurrency,
        settings.timezone,
        settings.roundOffEnabled ? 1 : 0,
        settings.backupDir ?? null,
        settings.defaultPrintVariant ?? 'a4',
        settings.typographyPreset ?? 'editorial',
        actorUserId
      ]
    );
  }
}

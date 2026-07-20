import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';
import {
  MetalRateRow,
  SaveMetalRatesRequest,
} from './interfaces/metal-rate';

@Injectable({
  providedIn: 'root'
})
export class MetalRatesService {

  constructor(private databaseService: DatabaseService) {}

  getCurrentRates(): Promise<MetalRateRow[]> {
    return this.databaseService.query('call get_current_metal_rates();');
  }

  saveRates(request: SaveMetalRatesRequest): Promise<MetalRateRow[]> {
    return this.databaseService.execute('call save_metal_rates(?, ?, ?, ?, ?);', [
      request.effectiveDate,
      request.session,
      request.source ?? 'manual',
      request.setByUserId ?? null,
      JSON.stringify(request.rates ?? [])
    ]);
  }

  /**
   * Build the JSON snapshot embedded in Invoices.rateSnapshot when a bill
   * is locked. Keys are purity codes ("916"), values are rate per gram.
   */
  buildSnapshot(rates: MetalRateRow[]): Record<string, number> {
    const snapshot: Record<string, number> = {};
    for (const r of rates) {
      snapshot[r.purityCode] = Number(r.ratePerGram);
    }
    return snapshot;
  }
}

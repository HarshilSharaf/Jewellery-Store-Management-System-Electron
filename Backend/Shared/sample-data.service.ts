import { Injectable } from '@angular/core';

export interface SampleDataResult {
  ok: boolean;
  summary?: {
    customers: number;
    products: number;
    orders: number;
    [k: string]: number;
  };
  error?: string;
}

/**
 * Renderer wrapper for the runtime sample-data load/clear IPC channels
 * (see src-electron/main.js db:seedSampleData / db:clearSampleData). Load is
 * only permitted into an empty shop; clear performs a guarded wipe of the
 * business tables. Both resolve to a { ok, ... } result rather than throwing.
 */
@Injectable({ providedIn: 'root' })
export class SampleDataService {
  private electronAPI: any = (window as any).electronAPI;

  load(size: 'small' | 'large' = 'small'): Promise<SampleDataResult> {
    return this.electronAPI.db.seedSampleData({ size });
  }

  clear(): Promise<SampleDataResult> {
    return this.electronAPI.db.clearSampleData();
  }
}

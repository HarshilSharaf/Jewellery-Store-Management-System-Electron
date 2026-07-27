import { StoreService } from './store.service';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseServiceInterface } from 'client/app/interfaces/Shared/database-service-interface';
import { LoggerService } from './logger.service';
import { AppDialogService } from 'client/app/shared/services/AppDialog/app-dialog.service';

/**
 * DEFAULT_QUERY_TIMEOUT_MS is applied to every execute() / query() call
 * unless a caller overrides it via the options argument. This prevents a
 * runaway query from stalling the UI indefinitely.
 */
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

/**
 * Options that can be passed to execute() and query() to override the
 * default per-query timeout. Kept intentionally small so callers do not
 * need to change their existing call sites.
 */
export interface DbQueryOptions {
  timeoutMs?: number;
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService implements DatabaseServiceInterface {

  /**
   * Renderer-side handle to the main-process managed pool. This is
   * intentionally typed as any because the concrete transport is IPC
   * (via `window.electronAPI.db`), not a mysql2 Connection object as it
   * was before the IPC bridge landed. The `dbConnection` name is retained
   * for interface compatibility with existing callers.
   */
  public dbConnection: any;
  private electronAPI: any = (window as any).electronAPI;
  private dialog = inject(AppDialogService);

  constructor(
    private storeService: StoreService,
    private router: Router,
    private loggerService: LoggerService
  ) {}

  async initializeDbConnection(): Promise<void> {
    try {
      // Embedded SQLite: the main process opens the database file at startup;
      // there are no credentials to pass. db:initialize is a no-op that just
      // reports readiness (kept so this bootstrap path stays unchanged).
      const result = await this.electronAPI.db.initialize();

      if (result && result.ok === false) {
        throw new Error(result.error || 'Unknown DB initialization error');
      }

      // Sentinel preserves the pre-IPC public shape (`dbConnection` was truthy
      // when the connection was up; callers may still check it).
      this.dbConnection = { ready: true };
    } catch (error) {
      this.loggerService.LogError(error, 'DatabaseService.initializeDbConnection()');
      this.showErrorAndRedirectToSettingsPage(error);
    }
  }

  showErrorAndRedirectToSettingsPage(error: any): void {
    this.dialog.fire({
      icon: 'error',
      title: 'Could Not Connect To Database!',
      html: `<span class="text-danger"> Error: ${error}
        <p class="text-warning my-2"> Redirecting to Settings Page...</p>
        </span>`,
      timer: 4000,
      showConfirmButton: false,
      disableEscape: true,
      disableBackdropClose: true,
    });
    setTimeout(() => {
      this.router.navigate(['settings'], {
        state: { error: error?.toString?.() ?? String(error) },
      });
    }, 4000);
  }

  /**
   * Merges all result arrays returned by mysql2 adapter.
   *
   * FRAGILE CONTRACT (do not casually refactor):
   * mysql2 returns `[rows, fields]` for a plain SELECT but for CALL of a
   * stored procedure it returns an array whose LAST element is a
   * ResultSetHeader (OkPacket) — every element BEFORE that is a result set
   * from one of the SELECTs inside the proc. We slice off the trailing
   * OkPacket and flatten the remaining sets into one array. Callers rely on
   * this flattened shape; a large number of components would break if the
   * shape changed. See individual db-*.service.ts callers.
   */
  prepareResponseData(finalResult: any[], results: any): any[] {
    if (results && results.length) {
      const filteredResults = results.slice(0, -1);
      filteredResults.forEach((result: any[]) => {
        finalResult = [...finalResult, ...result];
      });
    }
    return finalResult;
  }

  /**
   * Executes a parameterised SQL statement (prepared under the hood by
   * mysql2 in the main process). Applies a default 30s query timeout unless
   * overridden by `options.timeoutMs`.
   */
  async execute(query: string, values: any[], options?: DbQueryOptions): Promise<any> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    try {
      const results = await this.electronAPI.db.execute(query, values, { timeoutMs });
      return this.prepareResponseData([], results);
    } catch (error) {
      this.loggerService.LogError(error, `DatabaseService.execute(${this.snippet(query)})`);
      throw error;
    }
  }

  /**
   * Executes a raw (non-parameterised) SQL statement. Same timeout semantics
   * as execute(). Prefer execute() with placeholders wherever the query
   * takes user-provided values.
   */
  async query(query: string, options?: DbQueryOptions): Promise<any> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    try {
      const results = await this.electronAPI.db.query(query, { timeoutMs });
      return this.prepareResponseData([], results);
    } catch (error) {
      this.loggerService.LogError(error, `DatabaseService.query(${this.snippet(query)})`);
      throw error;
    }
  }

  private snippet(sql: string): string {
    if (!sql) { return ''; }
    return sql.length > 80 ? sql.slice(0, 80) + '...' : sql;
  }
}

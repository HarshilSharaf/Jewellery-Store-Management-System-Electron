import { Injectable, inject } from '@angular/core';
import { DatabaseService } from './database.service';
import { LoggerService } from './logger.service';

/**
 * First-run / setup-wizard state. Persisted in the DATABASE (singleton
 * `onboarding_state` row, see src-electron/db/schema/005_onboarding_state.sql)
 * rather than electron-store, so it is the authoritative per-shop record: it
 * survives config/appdata resets and travels with the shop's backups.
 *
 * The `completed` flag is the single source of truth for whether the wizard
 * runs. Nothing re-derives it from other data at runtime — it changes only via
 * the wizard's own writes (changePassword/complete) or the explicit "Replay
 * setup" action (reset). A one-time migration seed marks already-configured
 * installs complete on upgrade (see the migration file).
 */
export interface OnboardingState {
  /** True once the first-run wizard has been completed. */
  completed: boolean;
  /** True once the default admin password has been changed. */
  passwordChanged: boolean;
  /** True once demo/sample data has been loaded via the in-app action. */
  sampleDataLoaded: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  passwordChanged: false,
  sampleDataLoaded: false,
};

/** Coerces the SQLite 0/1 (or boolean) flag column to a real boolean. */
function toBool(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

@Injectable({
  providedIn: 'root',
})
export class OnboardingService {
  private databaseService = inject(DatabaseService);
  private loggerService = inject(LoggerService);


  /** Reads the persisted state from the DB. */
  async getState(): Promise<OnboardingState> {
    try {
      const rows: any = await this.databaseService.query('call get_onboarding_state();');
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) { return { ...DEFAULT_STATE }; }
      return {
        completed: toBool(row.completed),
        passwordChanged: toBool(row.passwordChanged),
        sampleDataLoaded: toBool(row.sampleDataLoaded),
      };
    } catch (err) {
      this.loggerService.LogError(err as string, 'OnboardingService.getState()');
      // Fail toward NOT interrupting: on a read error, don't trap the user in
      // the wizard (a broken DB surfaces elsewhere). Only a positive
      // completed=0 read triggers onboarding.
      return { completed: true, passwordChanged: true, sampleDataLoaded: false };
    }
  }

  /** Merges a patch into the persisted state and returns the new value. */
  async patchState(patch: Partial<OnboardingState>): Promise<OnboardingState> {
    const next = { ...(await this.getState()), ...patch };
    await this.databaseService.execute(
      'call set_onboarding_state(?, ?, ?);',
      [next.completed ? 1 : 0, next.passwordChanged ? 1 : 0, next.sampleDataLoaded ? 1 : 0],
    );
    return next;
  }

  /**
   * Decide whether the first-run wizard should run. The persisted `completed`
   * flag is authoritative.
   */
  async needsOnboarding(): Promise<boolean> {
    const state = await this.getState();
    return !state.completed;
  }

  /**
   * Self-service password change for the current user. Reuses the existing
   * `update_user_details(userId, userName, password, email)` proc, which assigns
   * userName/email directly (not COALESCE) -> the caller MUST pass the current
   * userName and email so they are not overwritten with null. `passwordHash`
   * is already bcrypt-hashed (see AuthService.hashPassword).
   */
  async changePassword(
    userId: number,
    userName: string,
    email: string | null,
    passwordHash: string,
  ): Promise<void> {
    await this.databaseService.execute(
      'call update_user_details(?, ?, ?, ?);',
      [userId, userName, passwordHash, email ?? null],
    );
    await this.patchState({ passwordChanged: true });
  }

  /** Marks the whole onboarding flow complete. */
  async complete(): Promise<void> {
    await this.patchState({ completed: true });
  }

  /**
   * Resets onboarding so the wizard can be replayed from Settings. Only clears
   * `completed`; `passwordChanged` is left intact so a replay does not force the
   * user to reset a password they have already changed.
   */
  async reset(): Promise<void> {
    await this.patchState({ completed: false });
  }
}

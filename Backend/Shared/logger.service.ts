import { Injectable } from '@angular/core';
import { LoggerServiceInterface } from 'client/app/interfaces/Shared/logger-service-interface';

@Injectable({
  providedIn: 'root'
})
export class LoggerService implements LoggerServiceInterface {

  private electronAPI: any = (window as any).electronAPI;

  constructor() {}

  public LogInfo(infoString: string) {
    const line = `[INFO FROM CLIENT] ${infoString}`;
    if (this.electronAPI?.logger?.info) {
      this.electronAPI.logger.info(line);
    } else {
      // Fallback so tests or bare-renderer contexts do not crash.
      console.log(line);
    }
  }

  public LogError(errorInput: any, errorFrom = '') {
    // `JSON.stringify(new Error(...))` yields `"{}"` because Error's built-in
    // fields (message, stack, code, ...) are non-enumerable. Normalise into a
    // plain object BEFORE serialising so the log actually contains useful
    // information for post-mortem debugging.
    const serialised = this.serializeError(errorInput);
    const payload = JSON.stringify(serialised);

    const line = errorFrom
      ? `[ERROR FROM CLIENT] ${errorFrom} threw an error: ${payload}`
      : `[ERROR FROM CLIENT] ${payload}`;

    if (this.electronAPI?.logger?.error) {
      this.electronAPI.logger.error(line);
    } else {
      console.error(line);
    }
  }

  private serializeError(err: any): any {
    if (err == null) {
      return { message: String(err) };
    }
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        // mysql2-specific fields; harmless when absent.
        code: (err as any).code,
        errno: (err as any).errno,
        sqlState: (err as any).sqlState,
        sqlMessage: (err as any).sqlMessage,
        stack: err.stack
      };
    }
    if (typeof err === 'object') {
      // Preserve whatever plain-object payload the caller passed in.
      return err;
    }
    return { message: String(err) };
  }
}

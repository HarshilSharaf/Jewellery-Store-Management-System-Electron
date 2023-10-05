import { Injectable } from '@angular/core';
import { LoggerServiceInterface } from 'client/app/interfaces/Shared/logger-service-interface';
const logger = (<any>window).require('electron-log');

@Injectable({
  providedIn: 'root'
})
export class LoggerService implements LoggerServiceInterface{
  constructor() {}

  public LogInfo(infoString: string) {
    logger.info(`[INFO FROM CLIENT] ${infoString}`);
  }

  public LogError(errorString: any ,errorFrom = '') {

    const errorObject = JSON.stringify(errorString)
    console.log({errorObject});
    
    if(errorFrom != '') {
      logger.error(`[ERROR FROM CLIENT] ${errorFrom} threw an error: ${errorObject}`);
    }
    else {
      logger.error(`[ERROR FROM CLIENT] ${errorObject}`);
    }
  }
}

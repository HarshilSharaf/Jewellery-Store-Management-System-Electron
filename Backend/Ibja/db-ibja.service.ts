import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import {
  GetIbjaSnapshotsArgs,
  IbjaSnapshot,
  IbjaSnapshotStatus,
} from '../Shared/interfaces/ibja';

@Injectable({
  providedIn: 'root'
})
export class DbIbjaService {

  constructor(private databaseService: DatabaseService) {}

  saveSnapshot(session: 'AM' | 'PM', rawResponse: string,
               status: IbjaSnapshotStatus, errorMessage: string | null = null): Promise<any> {
    return this.databaseService.execute(
      'call save_ibja_snapshot(?, ?, ?, ?);',
      [session, rawResponse, status, errorMessage]
    );
  }

  getSnapshots(args: GetIbjaSnapshotsArgs): Promise<IbjaSnapshot[]> {
    return this.databaseService.execute(
      'call get_ibja_snapshots(?, ?, ?, ?, ?);',
      [
        args.status ?? null,
        args.dateFrom ?? null,
        args.dateTo ?? null,
        args.pageSize ?? 20,
        args.page ?? 1,
      ]
    );
  }
}

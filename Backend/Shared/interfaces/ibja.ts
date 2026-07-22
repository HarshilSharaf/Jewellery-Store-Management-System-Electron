export type IbjaSession = 'AM' | 'PM';
export type IbjaSnapshotStatus = 'success' | 'parse_failure' | 'network_error';

export interface IbjaSnapshot {
  id?: number;
  snapshotGuid: string;
  fetchedAt: string;
  session: IbjaSession;
  status: IbjaSnapshotStatus;
  errorMessage?: string | null;
  rawResponsePreview?: string | null;
  parsedRates?: Record<string, number> | null;
  createdAt?: string;
}

export interface IbjaFetchResult {
  ok: boolean;
  session?: IbjaSession;
  purities?: Record<string, number>;
  fetchedAt?: string;
  error?: string;
}

export interface IbjaScheduleInfo {
  scheduled: boolean;
  nextFireAt: string | null;
  nextAmAt: string;
  nextPmAt: string;
}

export interface GetIbjaSnapshotsArgs {
  status?: IbjaSnapshotStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  pageSize?: number;
  page?: number;
}

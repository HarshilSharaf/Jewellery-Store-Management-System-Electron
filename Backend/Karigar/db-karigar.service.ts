import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import {
  AddKarigarPayload,
  IssueKarigarJobPayload,
  Karigar,
  KarigarJob,
  ReceiveKarigarJobPayload,
  SettleKarigarJobPayload,
  UpdateKarigarPayload,
} from '../Shared/interfaces/karigar';

@Injectable({
  providedIn: 'root'
})
export class DbKarigarService {

  constructor(private databaseService: DatabaseService) {}

  addKarigar(payload: AddKarigarPayload): Promise<any> {
    return this.databaseService.execute(
      'call add_karigar(?, ?, ?, ?, ?);',
      [
        payload.name,
        payload.phone ?? null,
        payload.address ?? null,
        payload.remarks ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  getAllKarigars(itemsPerPage: number, pageNumber: number,
                 searchQuery = ''): Promise<Karigar[]> {
    return this.databaseService.execute(
      'call get_all_karigars(?, ?, ?);',
      [itemsPerPage, pageNumber, searchQuery]
    );
  }

  updateKarigar(payload: UpdateKarigarPayload): Promise<any> {
    return this.databaseService.execute(
      'call update_karigar(?, ?, ?, ?, ?, ?);',
      [
        payload.karigarGuid,
        payload.name,
        payload.phone ?? null,
        payload.address ?? null,
        payload.remarks ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  deleteKarigar(karigarGuid: string, actorUserId: number | null = null): Promise<any> {
    return this.databaseService.execute(
      'call delete_karigar(?, ?);',
      [karigarGuid, actorUserId]
    );
  }

  issueJob(payload: IssueKarigarJobPayload): Promise<any> {
    return this.databaseService.execute(
      'call issue_karigar_job(?, ?, ?, ?, ?, ?, ?, ?);',
      [
        payload.karigarGuid,
        payload.issueDate ?? null,
        payload.issuedGrossWeight,
        payload.issuedPurityCode ?? null,
        payload.issuedStones ? JSON.stringify(payload.issuedStones) : null,
        payload.expectedReturnDate ?? null,
        payload.description ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  receiveJob(payload: ReceiveKarigarJobPayload): Promise<any> {
    return this.databaseService.execute(
      'call receive_karigar_job(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [
        payload.jobGuid,
        payload.receivedDate ?? null,
        payload.receivedGrossWeight,
        payload.receivedNetWeight,
        payload.receivedStoneWeight ?? 0,
        payload.wastagePercentAllowed ?? 0,
        payload.wastageGramsActual ?? 0,
        payload.makingCharge ?? 0,
        payload.remarks ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  settleJob(payload: SettleKarigarJobPayload): Promise<any> {
    return this.databaseService.execute(
      'call settle_karigar_job(?, ?, ?, ?, ?);',
      [
        payload.jobGuid,
        payload.settlementAmount,
        payload.paymentMode,
        payload.refNumber ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  getJobDetails(jobGuid: string): Promise<any> {
    return this.databaseService.execute(
      'call get_karigar_job_card_details(?);',
      [jobGuid]
    );
  }

  getAllJobs(itemsPerPage: number, pageNumber: number,
             karigarGuid: string | null = null,
             statusFilter: string | null = null): Promise<KarigarJob[]> {
    return this.databaseService.execute(
      'call get_all_karigar_jobs(?, ?, ?, ?);',
      [itemsPerPage, pageNumber, karigarGuid, statusFilter]
    );
  }

  getLedger(karigarGuid: string, dateFrom: string | null = null,
            dateTo: string | null = null): Promise<any> {
    return this.databaseService.execute(
      'call get_karigar_ledger(?, ?, ?);',
      [karigarGuid, dateFrom, dateTo]
    );
  }
}

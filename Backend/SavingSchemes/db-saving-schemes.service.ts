import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import {
  EnrollSavingSchemePayload,
  ForfeitSavingSchemePayload,
  RecordSchemeInstallmentPayload,
  RedeemSavingSchemePayload,
  SavingScheme,
} from '../Shared/interfaces/saving-scheme';

@Injectable({
  providedIn: 'root'
})
export class DbSavingSchemesService {

  constructor(private databaseService: DatabaseService) {}

  enroll(payload: EnrollSavingSchemePayload): Promise<any> {
    return this.databaseService.execute(
      'call enroll_saving_scheme(?, ?, ?, ?, ?, ?);',
      [
        payload.customerGuid,
        payload.planName,
        payload.monthlyAmount,
        payload.tenureMonths ?? 11,
        payload.bonusInstallments ?? 1,
        payload.actorUserId ?? null,
      ]
    );
  }

  recordInstallment(payload: RecordSchemeInstallmentPayload): Promise<any> {
    return this.databaseService.execute(
      'call record_scheme_installment(?, ?, ?, ?, ?, ?, ?);',
      [
        payload.schemeGuid,
        payload.amount,
        payload.paymentMode,
        payload.refNumber ?? null,
        payload.receiptDate ?? null,
        payload.actorUserId ?? null,
        payload.allowMultipleThisMonth ? 1 : 0,
      ]
    );
  }

  redeem(payload: RedeemSavingSchemePayload): Promise<any> {
    return this.databaseService.execute(
      'call redeem_saving_scheme(?, ?, ?);',
      [payload.schemeGuid, payload.invoiceGuid, payload.actorUserId ?? null]
    );
  }

  forfeit(payload: ForfeitSavingSchemePayload): Promise<any> {
    return this.databaseService.execute(
      'call forfeit_saving_scheme(?, ?, ?);',
      [payload.schemeGuid, payload.reason, payload.actorUserId ?? null]
    );
  }

  getDetails(schemeGuid: string): Promise<any> {
    return this.databaseService.execute(
      'call get_saving_scheme_details(?);',
      [schemeGuid]
    );
  }

  getAll(itemsPerPage: number, pageNumber: number,
         statusFilter: string | null = null,
         searchQuery = ''): Promise<SavingScheme[]> {
    return this.databaseService.execute(
      'call get_all_saving_schemes(?, ?, ?, ?);',
      [itemsPerPage, pageNumber, statusFilter, searchQuery]
    );
  }

  getByCustomer(customerGuid: string): Promise<SavingScheme[]> {
    return this.databaseService.execute(
      'call get_saving_schemes_by_customer(?);',
      [customerGuid]
    );
  }
}

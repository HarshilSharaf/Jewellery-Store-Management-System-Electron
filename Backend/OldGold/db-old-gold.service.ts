import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import { OldGoldReceipt, SaveOldGoldReceiptPayload } from '../Shared/interfaces/old-gold';

@Injectable({
  providedIn: 'root'
})
export class DbOldGoldService {

  constructor(private databaseService: DatabaseService) {}

  saveReceipt(payload: SaveOldGoldReceiptPayload): Promise<any> {
    return this.databaseService.execute(
      'call save_old_gold_receipt(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [
        payload.customerGuid,
        payload.invoiceGuid ?? null,
        payload.grossWeight,
        payload.testedPurityPercent ?? null,
        payload.testedPurityCode ?? null,
        payload.deductionPercent,
        payload.ratePerGram,
        payload.creditAmount,
        payload.remarks ?? null,
        payload.actorUserId ?? null
      ]
    );
  }

  getReceiptsByCustomer(customerGuid: string): Promise<OldGoldReceipt[]> {
    return this.databaseService.execute(
      'call get_old_gold_receipts_by_customer(?);',
      [customerGuid]
    );
  }

  getReceiptByInvoice(invoiceGuid: string): Promise<OldGoldReceipt[]> {
    return this.databaseService.execute(
      'call get_old_gold_receipt_by_invoice(?);',
      [invoiceGuid]
    );
  }
}

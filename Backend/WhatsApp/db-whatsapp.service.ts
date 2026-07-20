import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import {
  GetWhatsappLogArgs,
  UpdateWhatsappStatusPayload,
  WhatsappSendLogRow,
} from '../Shared/interfaces/whatsapp';

@Injectable({
  providedIn: 'root'
})
export class DbWhatsappService {

  constructor(private databaseService: DatabaseService) {}

  updateStatus(payload: UpdateWhatsappStatusPayload): Promise<any> {
    return this.databaseService.execute(
      'call update_whatsapp_status(?, ?, ?, ?, ?);',
      [
        payload.sendGuid,
        payload.newStatus,
        payload.metaMessageId ?? null,
        payload.errorMessage ?? null,
        payload.actorUserId ?? null,
      ]
    );
  }

  getLog(args: GetWhatsappLogArgs): Promise<WhatsappSendLogRow[]> {
    return this.databaseService.execute(
      'call get_whatsapp_send_log(?, ?, ?, ?, ?, ?);',
      [
        args.customerGuid ?? null,
        args.status ?? null,
        args.dateFrom ?? null,
        args.dateTo ?? null,
        args.pageSize ?? 20,
        args.page ?? 1,
      ]
    );
  }

  getByCustomer(customerGuid: string): Promise<WhatsappSendLogRow[]> {
    return this.databaseService.execute(
      'call get_whatsapp_sends_by_customer(?);',
      [customerGuid]
    );
  }

  getByInvoice(invoiceGuid: string): Promise<WhatsappSendLogRow[]> {
    return this.databaseService.execute(
      'call get_whatsapp_sends_by_invoice(?);',
      [invoiceGuid]
    );
  }
}

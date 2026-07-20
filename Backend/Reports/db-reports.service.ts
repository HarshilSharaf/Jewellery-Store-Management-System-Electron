import { Injectable } from '@angular/core';
import { DatabaseService } from '../Shared/database.service';
import { DayBookRow } from '../Shared/interfaces/report-day-book';
import { SalesRegisterRow } from '../Shared/interfaces/report-sales-register';
import {
  LowStockCategoryRow,
  StockSummaryByPurityRow,
} from '../Shared/interfaces/report-stock-summary';
import { Gstr1ExportPayload } from '../Shared/interfaces/report-gstr1';

@Injectable({
  providedIn: 'root'
})
export class DbReportsService {

  constructor(private databaseService: DatabaseService) {}

  getDayBook(dateFrom: string, dateTo: string): Promise<DayBookRow[]> {
    return this.databaseService.execute(
      'call get_day_book(?, ?);',
      [dateFrom, dateTo]
    );
  }

  getSalesRegister(dateFrom: string, dateTo: string,
                   customerGuid: string | null = null,
                   statusFilter: string | null = null): Promise<SalesRegisterRow[]> {
    return this.databaseService.execute(
      'call get_sales_register(?, ?, ?, ?);',
      [dateFrom, dateTo, customerGuid, statusFilter]
    );
  }

  getStockSummaryByPurity(asOfDate: string | null = null): Promise<StockSummaryByPurityRow[]> {
    return this.databaseService.execute(
      'call get_stock_summary_by_purity(?);',
      [asOfDate]
    );
  }

  getGstr1ExportRows(monthYear: string): Promise<Gstr1ExportPayload> {
    return this.databaseService.execute(
      'call get_gstr1_export_rows(?);',
      [monthYear]
    ).then((raw: any) => {
      const arr = Array.isArray(raw) ? raw : [];
      const rows: any[] = [];
      const hsnSummary: any[] = [];
      for (const row of arr) {
        if (row && row.hsnCode !== undefined && row.taxableValue !== undefined
            && row.invoiceCount !== undefined && row.invoiceNumber === undefined) {
          hsnSummary.push(row);
        } else if (row) {
          rows.push(row);
        }
      }
      return { rows, hsnSummary };
    });
  }

  getLowStockByCategory(thresholdCount = 3): Promise<LowStockCategoryRow[]> {
    return this.databaseService.execute(
      'call get_low_stock_by_category(?);',
      [thresholdCount]
    );
  }
}

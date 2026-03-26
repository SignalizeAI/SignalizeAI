import {
  flattenOutreachExportFields,
  OUTREACH_EXPORT_COLUMNS,
  OUTREACH_EXPORT_HEADERS,
} from './outreach-export.js';

interface SavedAnalysis {
  title?: string;
  domain?: string;
  url?: string;
  description?: string;
  sales_readiness_score?: number;
  what_they_do?: string;
  target_customer?: string;
  value_proposition?: string;
  best_sales_persona?: string;
  best_sales_persona_reason?: string;
  recommended_outreach_goal?: string;
  recommended_outreach_angle?: string;
  prospect_status?: string;
  outreach_angles?: {
    generated_at?: string;
    angles?: Array<{
      id?: string;
      variations?: Array<{
        subject?: string;
        body?: string;
      }>;
    }>;
  } | null;
  created_at?: string;
  [key: string]: any;
}

function normalizeExportRow(item: SavedAnalysis): Record<string, any> {
  return {
    ...item,
    ...flattenOutreachExportFields(item),
  };
}

export function exportToCSV(rows: SavedAnalysis[]): void {
  if (!rows.length) return;

  const csvEscape = (value: any): string => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const headers = [
    'Goal',
    'Outreach Angle',
    ...OUTREACH_EXPORT_HEADERS,
    'Title',
    'What They Do',
    'Company Overview',
    'Value Proposition',
    'Target Customer',
    'Sales Readiness Score',
    'Best Sales Persona',
    'Persona Reason',
    'URL',
    'Domain',
    'Prospect Status',
    'Saved At',
  ];

  const csvRows = [
    headers.map(csvEscape).join(','),
    ...rows.map((rawItem) => {
      const item = normalizeExportRow(rawItem);
      return [
        csvEscape(item.recommended_outreach_goal),
        csvEscape(item.recommended_outreach_angle),
        csvEscape(item.outreach_generated_at),
        csvEscape(item.recommended_email_label),
        csvEscape(item.recommended_email_subject),
        csvEscape(item.recommended_email_body),
        csvEscape(item.secondary_email_1_label),
        csvEscape(item.secondary_email_1_subject),
        csvEscape(item.secondary_email_1_body),
        csvEscape(item.secondary_email_2_label),
        csvEscape(item.secondary_email_2_subject),
        csvEscape(item.secondary_email_2_body),
        csvEscape(item.follow_up_1_label),
        csvEscape(item.follow_up_1_subject),
        csvEscape(item.follow_up_1_body),
        csvEscape(item.follow_up_2_label),
        csvEscape(item.follow_up_2_subject),
        csvEscape(item.follow_up_2_body),
        csvEscape(item.follow_up_3_label),
        csvEscape(item.follow_up_3_subject),
        csvEscape(item.follow_up_3_body),
        csvEscape(item.title),
        csvEscape(item.what_they_do),
        csvEscape(item.description),
        csvEscape(item.value_proposition),
        csvEscape(item.target_customer),
        csvEscape(item.sales_readiness_score),
        csvEscape(item.best_sales_persona),
        csvEscape(item.best_sales_persona_reason),
        csvEscape(item.url),
        csvEscape(item.domain),
        csvEscape(item.prospect_status),
        csvEscape(item.created_at),
      ].join(',');
    }),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'signalizeai_saved_prospects.csv';
  a.click();

  URL.revokeObjectURL(url);
}

export async function exportToExcel(rows: SavedAnalysis[]): Promise<void> {
  if (!rows.length) return;

  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Saved Prospects');

  sheet.columns = [
    { header: 'Goal', key: 'recommended_outreach_goal', width: 30 },
    { header: 'Outreach Angle', key: 'recommended_outreach_angle', width: 42 },
    ...OUTREACH_EXPORT_COLUMNS,
    { header: 'Title', key: 'title', width: 30 },
    { header: 'What They Do', key: 'what_they_do', width: 35 },
    { header: 'Company Overview', key: 'description', width: 40 },
    { header: 'Value Proposition', key: 'value_proposition', width: 35 },
    { header: 'Target Customer', key: 'target_customer', width: 30 },
    { header: 'Sales Readiness', key: 'sales_readiness_score', width: 18 },
    { header: 'Best Sales Persona', key: 'best_sales_persona', width: 22 },
    { header: 'Persona Reason', key: 'best_sales_persona_reason', width: 30 },
    { header: 'URL', key: 'url', width: 35 },
    { header: 'Domain', key: 'domain', width: 22 },
    { header: 'Prospect Status', key: 'prospect_status', width: 18 },
    { header: 'Saved At', key: 'created_at', width: 22 },
  ];

  rows.forEach((item) => sheet.addRow(normalizeExportRow(item)));

  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'signalizeai_saved_prospects.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export async function handleExport(format: 'csv' | 'xlsx'): Promise<void> {
  const { fetchSavedAnalysesData } = await import('./data.js');
  const data = await fetchSavedAnalysesData();
  if (format === 'csv') {
    exportToCSV(data);
  } else {
    await exportToExcel(data);
  }
}

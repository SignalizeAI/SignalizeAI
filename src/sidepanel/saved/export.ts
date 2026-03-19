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
  sales_angle?: string;
  recommended_outreach_persona?: string;
  recommended_outreach_goal?: string;
  recommended_outreach_angle?: string;
  recommended_outreach_message?: string;
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
    'Title',
    'Domain',
    'URL',
    'Description',
    'Sales Readiness Score',
    'What They Do',
    'Target Customer',
    'Value Proposition',
    'Best Sales Persona',
    'Persona Reason',
    'Sales Angle',
    'Outreach Persona',
    'Outreach Goal',
    'Outreach Angle',
    'Outreach Message',
    ...OUTREACH_EXPORT_HEADERS,
    'Saved At',
  ];

  const csvRows = [
    headers.map(csvEscape).join(','),
    ...rows.map((rawItem) => {
      const item = normalizeExportRow(rawItem);
      return [
        csvEscape(item.title),
        csvEscape(item.domain),
        csvEscape(item.url),
        csvEscape(item.description),
        csvEscape(item.sales_readiness_score),
        csvEscape(item.what_they_do),
        csvEscape(item.target_customer),
        csvEscape(item.value_proposition),
        csvEscape(item.best_sales_persona),
        csvEscape(item.best_sales_persona_reason),
        csvEscape(item.sales_angle),
        csvEscape(item.recommended_outreach_persona),
        csvEscape(item.recommended_outreach_goal),
        csvEscape(item.recommended_outreach_angle),
        csvEscape(item.recommended_outreach_message),
        csvEscape(item.outreach_generated_at),
        csvEscape(item.pain_point_subject_1),
        csvEscape(item.pain_point_body_1),
        csvEscape(item.pain_point_subject_2),
        csvEscape(item.pain_point_body_2),
        csvEscape(item.observation_subject_1),
        csvEscape(item.observation_body_1),
        csvEscape(item.observation_subject_2),
        csvEscape(item.observation_body_2),
        csvEscape(item.curiosity_subject_1),
        csvEscape(item.curiosity_body_1),
        csvEscape(item.curiosity_subject_2),
        csvEscape(item.curiosity_body_2),
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
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Domain', key: 'domain', width: 22 },
    { header: 'URL', key: 'url', width: 35 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Sales Readiness', key: 'sales_readiness_score', width: 18 },
    { header: 'What They Do', key: 'what_they_do', width: 35 },
    { header: 'Target Customer', key: 'target_customer', width: 30 },
    { header: 'Value Proposition', key: 'value_proposition', width: 35 },
    { header: 'Best Sales Persona', key: 'best_sales_persona', width: 22 },
    { header: 'Persona Reason', key: 'best_sales_persona_reason', width: 30 },
    { header: 'Sales Angle', key: 'sales_angle', width: 35 },
    { header: 'Outreach Persona', key: 'recommended_outreach_persona', width: 24 },
    { header: 'Outreach Goal', key: 'recommended_outreach_goal', width: 30 },
    { header: 'Outreach Angle', key: 'recommended_outreach_angle', width: 35 },
    { header: 'Outreach Message', key: 'recommended_outreach_message', width: 45 },
    ...OUTREACH_EXPORT_COLUMNS,
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

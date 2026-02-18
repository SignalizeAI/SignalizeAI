export function exportToCSV(rows) {
  if (!rows.length) return;

  const csvEscape = (value) => {
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
    'Saved At',
  ];

  const csvRows = [
    headers.map(csvEscape).join(','),
    ...rows.map((item) =>
      [
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
        csvEscape(item.created_at),
      ].join(',')
    ),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'signalizeai_saved_analyses.csv';
  a.click();

  URL.revokeObjectURL(url);
}

export async function exportToExcel(rows) {
  if (!rows.length) return;

  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Saved Analyses');

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
    { header: 'Saved At', key: 'created_at', width: 22 },
  ];

  rows.forEach((item) => sheet.addRow(item));

  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'signalizeai_saved_analyses.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export async function handleExport(format) {
  const { fetchSavedAnalysesData } = await import('./data.js');
  const data = await fetchSavedAnalysesData();
  if (format === 'csv') {
    exportToCSV(data);
  } else {
    await exportToExcel(data);
  }
}

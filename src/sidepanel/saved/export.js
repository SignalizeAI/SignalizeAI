import ExcelJS from 'exceljs';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';

const EXPORT_COLUMNS = [
  { header: 'Title', key: 'title' },
  { header: 'Domain', key: 'domain' },
  { header: 'URL', key: 'url' },
  { header: 'What they do', key: 'what_they_do' },
  { header: 'Target customer', key: 'target_customer' },
  { header: 'Value proposition', key: 'value_proposition' },
  { header: 'Sales angle', key: 'sales_angle' },
  { header: 'Sales readiness score', key: 'sales_readiness_score' },
  { header: 'Best sales persona', key: 'best_sales_persona' },
  { header: 'Best sales persona reason', key: 'best_sales_persona_reason' },
  { header: 'Outreach persona', key: 'recommended_outreach_persona' },
  { header: 'Outreach goal', key: 'recommended_outreach_goal' },
  { header: 'Outreach angle', key: 'recommended_outreach_angle' },
  { header: 'Outreach message', key: 'recommended_outreach_message' },
  { header: 'Created at', key: 'created_at' },
  { header: 'Last analyzed at', key: 'last_analyzed_at' },
];

function applyFilters(query) {
  const { minScore, maxScore, persona, searchQuery, sort } = state.activeFilters;

  if (minScore > 0) query = query.gte('sales_readiness_score', minScore);
  if (maxScore < 100) query = query.lte('sales_readiness_score', maxScore);
  if (persona) query = query.eq('best_sales_persona', persona);

  if (searchQuery) {
    query = query.or(
      `title.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
    );
  }

  const sortMap = {
    created_at_desc: { column: 'created_at', ascending: false },
    created_at_asc: { column: 'created_at', ascending: true },
    last_analyzed_at_desc: { column: 'last_analyzed_at', ascending: false },
    sales_readiness_score_desc: { column: 'sales_readiness_score', ascending: false },
    sales_readiness_score_asc: { column: 'sales_readiness_score', ascending: true },
    title_asc: { column: 'title', ascending: true },
    title_desc: { column: 'title', ascending: false },
  };

  const sortConfig = sortMap[sort] || sortMap.created_at_desc;
  return query.order(sortConfig.column, { ascending: sortConfig.ascending });
}

function buildCsv(data) {
  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const headerRow = EXPORT_COLUMNS.map((col) => escapeCell(col.header)).join(',');
  const rows = data.map((item) => EXPORT_COLUMNS.map((col) => escapeCell(item[col.key])).join(','));

  return [headerRow, ...rows].join('\n');
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export async function handleExport(format) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    showToast('Please sign in to export analyses.');
    return;
  }

  let query = supabase.from('saved_analyses').select('*').eq('user_id', user.id);
  query = applyFilters(query);

  const { data, error } = await query.range(0, 9999);

  if (error) {
    showToast('Failed to export analyses.');
    return;
  }

  if (!data || data.length === 0) {
    showToast('No saved analyses to export.');
    return;
  }

  const dateLabel = new Date().toISOString().slice(0, 10);

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Saved Analyses');
    sheet.columns = EXPORT_COLUMNS.map((col) => ({
      header: col.header,
      key: col.key,
      width: Math.min(60, Math.max(16, col.header.length + 4)),
    }));

    data.forEach((item) => {
      sheet.addRow(item);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    downloadBlob(blob, `signalize_saved_${dateLabel}.xlsx`);
    showToast('Exported to Excel.');
    return;
  }

  const csv = buildCsv(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `signalize_saved_${dateLabel}.csv`);
  showToast('Exported to CSV.');
}

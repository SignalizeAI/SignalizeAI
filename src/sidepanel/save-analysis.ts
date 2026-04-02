import { supabase } from './supabase.js';
import { state } from './state.js';
import { renderQuotaBanner, loadQuotaFromAPI } from './quota.js';
import { showLimitModal } from './modal.js';
import { showToast } from './toast.js';
import { updateAnalysisDashboardButton } from './dashboard-link.js';
import { buildPersistedOutreachAngle } from './analysis/outreach-angle.js';
import { syncProspectContentToWebsite } from './content-sync.js';
import { getHomepageAnalysisForSave } from './analysis/extraction.js';
import { loadSavedAnalyses } from './saved/index.js';

export async function ensureCurrentAnalysisSaved(): Promise<string | null> {
  if (!state.lastAnalysis || !state.lastExtractedMeta) return null;

  await loadQuotaFromAPI();

  const saveButton = document.getElementById('saveButton') as HTMLButtonElement | null;
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;

  if (saveButton?.classList.contains('active') && saveButton.dataset.savedId) {
    return saveButton.dataset.savedId;
  }

  if (state.totalSavedCount >= state.maxSavedLimit) {
    showLimitModal('save');
    return null;
  }

  const currentUrl = state.lastExtractedMeta.url;
  const urlObj = new URL(currentUrl);
  const isHomepage = urlObj.pathname === '/' || urlObj.pathname === '';
  const originUrl = urlObj.origin;

  const { data: existing } = await supabase
    .from('saved_analyses')
    .select('id')
    .eq('user_id', user.id)
    .eq('domain', state.lastExtractedMeta.domain)
    .limit(1)
    .maybeSingle();

  const isPendingDelete = existing && state.pendingDeleteMap.has(existing.id);
  if (existing && !isPendingDelete) {
    if (saveButton) {
      saveButton.classList.add('active');
      saveButton.title = 'Remove';
      saveButton.dataset.savedId = existing.id;
    }
    updateAnalysisDashboardButton(existing.id);
    return existing.id;
  }

  let saveAnalysis = state.lastAnalysis;
  let saveMeta = state.lastExtractedMeta;
  let saveContentHash = state.lastContentHash;

  if (!isHomepage) {
    if (saveButton) saveButton.disabled = true;
    let homepageResult = null;

    try {
      saveButton?.classList.add('saving');
      homepageResult = await getHomepageAnalysisForSave(originUrl);
    } finally {
      saveButton?.classList.remove('saving');
      if (saveButton) saveButton.disabled = false;
    }

    if (homepageResult?.blocked) return null;

    if (!homepageResult?.analysis || !homepageResult?.meta) {
      showToast('Unable to save homepage prospect data.');
      return null;
    }

    saveAnalysis = homepageResult.analysis;
    saveMeta = homepageResult.meta;
    saveContentHash = homepageResult.contentHash;
  }

  const { data: insertData, error } = await supabase
    .from('saved_analyses')
    .insert({
      user_id: user.id,
      domain: saveMeta.domain,
      url: originUrl,
      title: saveMeta.title,
      description: saveMeta.description,
      content_hash: saveContentHash,
      last_analyzed_at: new Date().toISOString(),
      what_they_do: saveAnalysis.whatTheyDo,
      target_customer: saveAnalysis.targetCustomer,
      value_proposition: saveAnalysis.valueProposition,
      prospect_status: 'not_contacted',
      sales_readiness_score: saveAnalysis.salesReadinessScore,
      best_sales_persona: saveAnalysis.bestSalesPersona?.persona,
      best_sales_persona_reason: saveAnalysis.bestSalesPersona?.reason,
      recommended_outreach_goal: saveAnalysis.recommendedOutreach?.goal,
      recommended_outreach_angle: buildPersistedOutreachAngle(saveAnalysis),
      ...(state.outreachAngles
        ? {
            outreach_angles: {
              generated_at: new Date().toISOString(),
              recommended_angle_id: state.outreachAngles.recommendedAngleId,
              angles: state.outreachAngles.angles,
              ...(state.followUpEmails ? { follow_ups: state.followUpEmails } : {}),
            },
          }
        : {}),
    })
    .select('id')
    .single();

  if (error) {
    const message =
      error.code === '23505' || /duplicate|unique/i.test(error.message || '')
        ? 'Already saved for this domain.'
        : 'Failed to save. Please try again.';
    console.error('Failed to save:', error);
    showToast(message);
    return null;
  }

  if (saveButton) {
    saveButton.classList.add('active');
    saveButton.title = 'Remove';
  }
  if (insertData?.id) {
    if (saveButton) saveButton.dataset.savedId = insertData.id;
    updateAnalysisDashboardButton(insertData.id);
    await syncProspectContentToWebsite([insertData.id]);
  } else {
    await syncProspectContentToWebsite();
  }
  if (Number.isFinite(state.totalSavedCount)) {
    state.totalSavedCount += 1;
  }
  renderQuotaBanner();
  loadSavedAnalyses();
  await loadQuotaFromAPI(true);
  return insertData?.id || null;
}

import { supabase } from '../../supabase.js';
import { loadQuotaFromAPI, renderQuotaBanner } from '../../quota.js';
import { showActionTooltip } from '../../clipboard.js';
import { showToast } from '../../toast.js';
import { batchState } from './state.js';
import { cleanTitle } from './helpers.js';
import type { BatchResult } from './types.js';

interface SaveFlowDeps {
  renderBatchResultsPage: () => void;
}

export function createBatchSaveFlow(deps: SaveFlowDeps) {
  const { renderBatchResultsPage } = deps;

  async function saveSingleResult(index: number, btn: HTMLButtonElement) {
    const res = batchState.tempBatchResults[index];

    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
    btn.disabled = true;

    try {
      let actionLabel = '';
      if (res.status === 'saved') {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) throw new Error('Not logged in');

        const { error } = await supabase.from('saved_analyses').delete().eq('user_id', user.id).eq('domain', res.domain);
        if (error) throw error;

        res.status = 'ready';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
        btn.style.color = '';
        actionLabel = 'Unsaved';
      } else {
        await performSave(res);
        res.status = 'saved';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
        btn.style.color = 'var(--text-primary)';
        actionLabel = 'Saved';
      }

      btn.disabled = false;
      showActionTooltip(btn, actionLabel);
      await refreshQuotaBannerNow();
      setTimeout(() => {
        renderBatchResultsPage();
      }, 250);
    } catch (err: any) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      showToast(err.message || 'Failed to save');
    }
  }

  async function saveSpecificBatchSelection(indicesToSave: number[], triggeredBtn: HTMLButtonElement) {
    const originalHtml = triggeredBtn.innerHTML;
    triggeredBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
    triggeredBtn.disabled = true;

    let savedCount = 0;
    for (const index of indicesToSave) {
      const res = batchState.tempBatchResults[index];
      if (res.status === 'saved') continue;
      try {
        await performSave(res);
        res.status = 'saved';
        savedCount++;
        if (savedCount % 2 === 0) {
          renderBatchResultsPage();
        }
      } catch (err) {
        console.error('Batch save error:', err);
      }
    }

    await refreshQuotaBannerNow();

    renderBatchResultsPage();

    triggeredBtn.disabled = false;
    triggeredBtn.innerHTML = originalHtml;

    showToast(`Successfully saved ${savedCount} analyses.`);
  }

  async function saveAllBatchSelection() {
    if (batchState.tempBatchResults.length === 0) return;

    const saveAllBtn = document.getElementById('batch-save-all-btn') as HTMLButtonElement | null;
    if (saveAllBtn) {
      saveAllBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
      saveAllBtn.style.color = '';
      saveAllBtn.disabled = true;
    }

    const allSaved = batchState.tempBatchResults.every(r => r.status === 'saved');
    let actionLabel = '';

    try {
      if (allSaved) {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) throw new Error('Not logged in');

        const domains = batchState.tempBatchResults.map(r => r.domain);
        const { error } = await supabase.from('saved_analyses').delete().eq('user_id', user.id).in('domain', domains);
        if (error) throw error;

        batchState.tempBatchResults.forEach(r => r.status = 'ready');
        actionLabel = 'Unsaved all';
      } else {
        const indicesToSave = batchState.tempBatchResults
          .map((_, i) => i)
          .filter((i) => batchState.tempBatchResults[i].status === 'ready');

        let savedCount = 0;
        for (const i of indicesToSave) {
          try {
            await performSave(batchState.tempBatchResults[i]);
            batchState.tempBatchResults[i].status = 'saved';
            savedCount++;
            if (savedCount % 2 === 0) renderBatchResultsPage();
          } catch {
            // ignore and continue batch action
          }
        }

        if (savedCount > 0) {
          actionLabel = 'Saved all';
        } else {
          showToast('No new analyses available to save.');
        }
      }

      await refreshQuotaBannerNow();
    } catch (err: any) {
      console.error('Batch action error:', err);
      showToast(err.message || 'Action failed.');
    }

    if (saveAllBtn) {
      saveAllBtn.disabled = false;
    }

    renderBatchResultsPage();

    if (saveAllBtn && actionLabel) {
      showActionTooltip(saveAllBtn, actionLabel);
    }
  }

  return { saveSingleResult, saveSpecificBatchSelection, saveAllBatchSelection };
}

async function performSave(res: BatchResult) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) throw new Error('Not logged in');

  const insertData = {
    user_id: user.id,
    domain: res.domain,
    url: res.url,
    title: cleanTitle(res.content.title),
    description: res.content.metaDescription,
    content_hash: res.contentHash,
    last_analyzed_at: new Date().toISOString(),
    what_they_do: res.analysis.whatTheyDo,
    target_customer: res.analysis.targetCustomer,
    value_proposition: res.analysis.valueProposition,
    sales_angle: res.analysis.salesAngle,
    sales_readiness_score: res.analysis.salesReadinessScore,
    best_sales_persona: res.analysis.bestSalesPersona?.persona,
    best_sales_persona_reason: res.analysis.bestSalesPersona?.reason,
    recommended_outreach_persona: res.analysis.recommendedOutreach?.persona,
    recommended_outreach_goal: res.analysis.recommendedOutreach?.goal,
    recommended_outreach_angle: res.analysis.recommendedOutreach?.angle,
    recommended_outreach_message: res.analysis.recommendedOutreach?.message,
  };

  const { error } = await supabase.from('saved_analyses').insert(insertData);
  if (error) {
    if (error.code === '23505') throw new Error('Already saved');
    throw new Error('Save failed');
  }
}

async function refreshQuotaBannerNow() {
  try {
    await loadQuotaFromAPI(true);
  } catch {
    renderQuotaBanner();
  }
}

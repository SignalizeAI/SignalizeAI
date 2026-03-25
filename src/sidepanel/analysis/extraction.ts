import { analyzeWebsiteContent } from '../../ai-analyze.js';
import {
  clearCachedOutreach,
  extractRootDomain,
  getCachedAnalysis,
  getCachedAnalysisByDomain,
  hashContent,
  markDomainAnalyzedToday,
  setCachedAnalysis,
  setCachedAnalysisByDomain,
  wasDomainAnalyzedToday,
} from '../cache.js';
import { loadSettings } from '../settings.js';
import { loadQuotaFromAPI, renderQuotaBanner } from '../quota.js';
import { supabase } from '../supabase.js';
import { state, type ExtractedMeta } from '../state.js';
import { updateAnalysisDashboardButton } from '../dashboard-link.js';
import { showLimitModal } from '../modal.js';
import { showToast } from '../toast.js';
import { buildPersistedOutreachAngle } from './outreach-angle.js';
import { cleanTitle, endAnalysisLoading } from './utils.js';
import { showContentBlocked, displayAIAnalysis } from './display.js';
import { getActiveTab, ensureContentScriptLoaded } from '../utils.js';
import { fetchAndExtractContent } from './fetcher.js';
import { fetchSavedAnalysisById } from '../saved/data.js';

interface ContentResponse {
  ok: boolean;
  content?: any;
  reason?: string;
  error?: string;
}

function buildCurrentOutreachPayload(): Record<string, unknown> | undefined {
  if (!state.outreachAngles?.angles?.length) return undefined;

  return {
    generated_at: new Date().toISOString(),
    recommended_angle_id: state.outreachAngles.recommendedAngleId,
    angles: state.outreachAngles.angles,
    ...(state.followUpEmails?.emails?.length ? { follow_ups: state.followUpEmails } : {}),
  };
}

function getReusableOutreachPayload(options: {
  existingPayload?: Record<string, unknown> | null;
  previousDomain?: string | null;
  currentDomain: string;
}): Record<string, unknown> | undefined {
  if (state.forceRefresh) return undefined;
  if (options.existingPayload) return options.existingPayload;
  if (options.previousDomain === options.currentDomain) {
    return buildCurrentOutreachPayload();
  }
  return undefined;
}

async function fetchSavedProspectByDomain(domain: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user || !domain) return null;

  const { data } = await supabase
    .from('saved_analyses')
    .select('*')
    .eq('user_id', user.id)
    .eq('domain', domain)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

function isHomepageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname === '/' || urlObj.pathname === '';
  } catch {
    return false;
  }
}

function setLoadingMessage(message: string): void {
  const el = document.getElementById('ai-loading-message');
  if (el) el.textContent = message;
}

function getProspectRouteSavedId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const isWebsiteHost =
      url.hostname === 'signalizeai.org' ||
      url.hostname === 'www.signalizeai.org' ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1';
    if (!isWebsiteHost) return null;

    const match = url.pathname.match(/^\/prospect\/([a-f0-9-]+)$/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function updateSavedProspectAnalysis(
  savedId: string,
  meta: ExtractedMeta,
  analysis: ReturnType<typeof mapSavedRowToAnalysis>,
  contentHash: string | null
): Promise<void> {
  const { error } = await supabase
    .from('saved_analyses')
    .update({
      content_hash: contentHash,
      last_analyzed_at: new Date().toISOString(),
      title: meta.title,
      description: meta.description,
      url: meta.url,
      domain: meta.domain,
      what_they_do: analysis.whatTheyDo,
      target_customer: analysis.targetCustomer,
      value_proposition: analysis.valueProposition,
      sales_readiness_score: analysis.salesReadinessScore,
      best_sales_persona: analysis.bestSalesPersona?.persona,
      best_sales_persona_reason: analysis.bestSalesPersona?.reason,
      recommended_outreach_goal: analysis.recommendedOutreach?.goal,
      recommended_outreach_angle: buildPersistedOutreachAngle(analysis),
      outreach_angles: null,
    })
    .eq('id', savedId);

  if (error) {
    console.error('Failed to update saved prospect after refresh:', error);
    showToast('Failed to sync refreshed prospect data.');
  }
}

function mapSavedRowToAnalysis(row: any) {
  return {
    whatTheyDo: row.what_they_do || '',
    targetCustomer: row.target_customer || '',
    valueProposition: row.value_proposition || '',
    salesAngle: '',
    salesReadinessScore: row.sales_readiness_score || 0,
    bestSalesPersona: {
      persona: row.best_sales_persona || '',
      reason: row.best_sales_persona_reason || '',
    },
    recommendedOutreach: {
      goal: row.recommended_outreach_goal || '',
      angle: row.recommended_outreach_angle || '',
      message: '',
    },
  };
}

function displaySavedProspectRow(row: any): void {
  state.lastAnalysis = mapSavedRowToAnalysis(row);
  state.lastContentHash = row.content_hash || null;
  state.lastExtractedMeta = {
    title: cleanTitle(row.title || row.domain || ''),
    description: row.description || '',
    url: row.url || '',
    domain: row.domain || '',
  };
  state.lastExtractedEvidence = null;
  state.lastAnalyzedDomain = row.domain || null;

  const saveBtn = document.getElementById('saveButton') as HTMLButtonElement | null;
  if (saveBtn) {
    saveBtn.classList.add('active');
    saveBtn.title = 'Remove';
    saveBtn.dataset.savedId = row.id;
  }

  updateAnalysisDashboardButton(row.id);
  displayAIAnalysis(state.lastAnalysis, row.outreach_angles ?? undefined);
}

async function loadSavedProspectFromTab(savedId: string): Promise<boolean> {
  const row = await fetchSavedAnalysisById(savedId);
  if (!row) return false;

  displaySavedProspectRow(row);
  return true;
}

async function clearSavedOutreachAfterRefresh(savedId: string | null | undefined): Promise<void> {
  if (!savedId) return;

  const { error } = await supabase
    .from('saved_analyses')
    .update({ outreach_angles: null })
    .eq('id', savedId);

  if (error) {
    console.error('Failed to clear stale outreach emails after refresh:', error);
  }
}

async function clearCachedOutreachAfterRefresh(): Promise<void> {
  const meta = state.lastExtractedMeta;
  if (!meta) return;
  await clearCachedOutreach(meta.url, meta.domain);
}

async function reanalyzeSavedProspectFromRoute(savedId: string): Promise<void> {
  const row = await fetchSavedAnalysisById(savedId);
  if (!row?.url) {
    showContentBlocked('This saved prospect does not have a website URL to re-analyze.');
    return;
  }

  await analyzeSpecificUrl(row.url, { preserveSavedId: savedId });
}

export async function refreshSaveButtonState(): Promise<void> {
  if (!state.lastExtractedMeta?.domain) return;

  const btn = document.getElementById('saveButton') as HTMLButtonElement | null;
  if (!btn) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    btn.classList.remove('active');
    btn.title = 'Save';
    delete btn.dataset.savedId;
    updateAnalysisDashboardButton(null);
    return;
  }

  const { data: existing } = await supabase
    .from('saved_analyses')
    .select('id')
    .eq('user_id', user.id)
    .eq('domain', state.lastExtractedMeta.domain)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isPendingDelete = existing && state.pendingDeleteMap.has(existing.id);

  if (existing && !isPendingDelete) {
    btn.classList.add('active');
    btn.title = 'Remove';
    btn.dataset.savedId = existing.id;
    updateAnalysisDashboardButton(existing.id);
  } else {
    btn.classList.remove('active');
    btn.title = 'Save';
    delete btn.dataset.savedId;
    updateAnalysisDashboardButton(null);
  }
}

export async function extractWebsiteContent(): Promise<void> {
  if (state.isUserInteracting) {
    document.getElementById('ai-loading')?.classList.add('hidden');
    endAnalysisLoading();
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    document.getElementById('ai-loading')?.classList.add('hidden');
    endAnalysisLoading();
    return;
  }

  await loadQuotaFromAPI();

  if (state.remainingToday !== null && state.remainingToday <= 0 && state.currentPlan === 'free') {
    document.getElementById('ai-loading')?.classList.add('hidden');
    endAnalysisLoading();
    showLimitModal('analysis');
    return;
  }
  if (state.currentView !== 'analysis') {
    document.getElementById('ai-loading')?.classList.add('hidden');
    endAnalysisLoading();
    return;
  }
  const aiCard = document.getElementById('ai-analysis');
  const contentLoading = document.getElementById('ai-loading');
  const contentError = document.getElementById('content-error');
  const contentData = document.getElementById('ai-data');

  if (contentLoading && !contentLoading.classList.contains('hidden') && !state.forceRefresh) {
    endAnalysisLoading();
    return;
  }

  const settings = await loadSettings();

  if (aiCard) aiCard.classList.remove('hidden');
  if (contentLoading) contentLoading.classList.remove('hidden');
  if (contentError) contentError.classList.add('hidden');
  if (contentData) contentData.classList.add('hidden');
  document.getElementById('empty-tab-view')?.classList.add('hidden');
  setLoadingMessage('Extracting page content...');
  state.isAnalysisLoading = true;

  try {
    const tab = await getActiveTab();

    if (!tab?.id) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add('hidden');
      showContentBlocked('Unable to access tab information.');
      return;
    }

    if (!tab.url) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add('hidden');
      showContentBlocked('Please navigate to a website to generate insights.');
      return;
    }

    const prospectSavedId = getProspectRouteSavedId(tab.url);
    if (prospectSavedId) {
      const loaded = await loadSavedProspectFromTab(prospectSavedId);
      if (!loaded) {
        endAnalysisLoading();
        if (contentLoading) contentLoading.classList.add('hidden');
        showContentBlocked('This saved prospect could not be loaded in the extension.');
      }
      return;
    }

    if (tab.url.includes('signalizeai.org/auth/callback')) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add('hidden');
      showContentBlocked('Login completed. Navigate to a website to generate insights.');
      return;
    }

    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://')
    ) {
      endAnalysisLoading();
      document.getElementById('ai-analysis')?.classList.add('hidden');
      document.getElementById('ai-loading')?.classList.add('hidden');
      const emptyView = document.getElementById('empty-tab-view');
      if (emptyView) {
        const titleEl = emptyView.querySelector('.empty-tab-title');
        const descEl = emptyView.querySelector('.empty-tab-description');
        if (titleEl) titleEl.textContent = 'No website open';
        if (descEl) {
          descEl.textContent =
            'Navigate to any business website to see AI-powered sales insights instantly.';
        }
        emptyView.classList.remove('hidden');
      }
      console.info('Empty tab or browser system page:', tab.url);
      return;
    }

    const scriptLoaded = await ensureContentScriptLoaded(tab.id);
    if (!scriptLoaded) {
      endAnalysisLoading();
      showContentBlocked('Unable to load content script.');
      return;
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        document.getElementById('ai-loading')?.classList.add('hidden');
        showContentBlocked('Timed out while generating insights. Please try again.');
        resolve();
      }, 15000);

      chrome.tabs.sendMessage(
        tab.id!,
        { type: 'EXTRACT_WEBSITE_CONTENT' },
        async (response: ContentResponse) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            endAnalysisLoading();
            showContentBlocked('Failed to extract page content. This page may not be accessible.');
            resolve();
            return;
          }

          if (!response) {
            endAnalysisLoading();
            showContentBlocked('No response from content script');
            resolve();
            return;
          }

          if (response?.ok && response.content) {
            const previousUrl = state.lastExtractedMeta?.url || null;
            const previousDomain = state.lastExtractedMeta?.domain || null;
            const aiLoading = document.getElementById('ai-loading');

            state.lastExtractedMeta = {
              title: cleanTitle(response.content.title),
              description: response.content.metaDescription,
              url: response.content.url,
              domain: new URL(response.content.url).hostname,
            };
            state.lastExtractedEvidence = {
              title: cleanTitle(response.content.title),
              metaDescription: response.content.metaDescription,
              headings: response.content.headings || [],
              paragraphs: response.content.paragraphs || [],
            };

            const currentDomain = state.lastExtractedMeta.domain;
            const currentUrl = state.lastExtractedMeta.url;
            const previousContentHash = state.lastContentHash;
            state.lastContentHash = await hashContent(response.content);

            const btn = document.getElementById('saveButton') as HTMLButtonElement | null;
            btn?.classList.remove('active');
            if (btn) btn.title = 'Save';

            const { data: sessionData } = await supabase.auth.getSession();
            const user = sessionData?.session?.user;

            let existing = null;
            let cached = null;

            if (user) {
              const { data } = await supabase
                .from('saved_analyses')
                .select('*')
                .eq('user_id', user.id)
                .eq('domain', currentDomain)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              existing = data;

              const isPendingDelete = existing && state.pendingDeleteMap.has(existing.id);

              if (existing && !isPendingDelete) {
                btn?.classList.add('active');
                if (btn) btn.title = 'Remove';
                if (btn) btn.dataset.savedId = existing.id;
                updateAnalysisDashboardButton(existing.id);
              } else if (btn) {
                delete btn.dataset.savedId;
                updateAnalysisDashboardButton(null);
              }

              if (existing && !isPendingDelete && !state.forceRefresh) {
                if (aiLoading) aiLoading.classList.add('hidden');
                displaySavedProspectRow(existing);
                endAnalysisLoading();
                resolve();
                return;
              }
            }

            cached = await getCachedAnalysis(currentUrl);

            try {
              const aiCard = document.getElementById('ai-analysis');
              const aiData = document.getElementById('ai-data');

              if (aiCard) aiCard.classList.remove('hidden');

              const reuseAllowed =
                settings.reanalysisMode === 'content-change' && !state.forceRefresh;
              const canReuseExisting =
                reuseAllowed &&
                existing &&
                existing.content_hash === state.lastContentHash &&
                existing.url === currentUrl;
              const canReuseCached = reuseAllowed && cached && cached.meta?.url === currentUrl;

              const shouldReuse = canReuseExisting || canReuseCached;

              if (shouldReuse) {
                if (aiLoading) aiLoading.classList.add('hidden');

                if (canReuseExisting) {
                  state.lastAnalysis = {
                    whatTheyDo: existing.what_they_do,
                    targetCustomer: existing.target_customer,
                    valueProposition: existing.value_proposition,
                    salesAngle: '',
                    salesReadinessScore: existing.sales_readiness_score,
                    bestSalesPersona: {
                      persona: existing.best_sales_persona,
                      reason: existing.best_sales_persona_reason,
                    },
                    recommendedOutreach: {
                      goal: existing?.recommended_outreach_goal || '',
                      angle: existing?.recommended_outreach_angle || '',
                      message: '',
                    },
                  };

                  state.lastExtractedMeta = {
                    title: cleanTitle(existing.title),
                    description: existing.description,
                    url: existing.url,
                    domain: existing.domain,
                  };
                } else if (canReuseCached) {
                  state.lastAnalysis = cached!.analysis;
                  state.lastExtractedMeta = cached!.meta;
                }

                displayAIAnalysis(
                  state.lastAnalysis!,
                  getReusableOutreachPayload({
                    existingPayload: canReuseExisting
                      ? existing?.outreach_angles
                      : (cached?.outreachPayload ?? null),
                    previousDomain,
                    currentDomain,
                  })
                );
                endAnalysisLoading();

                state.lastAnalyzedDomain = currentDomain;

                resolve();
              } else {
                const rootDomain = extractRootDomain(currentDomain);
                const lastRootDomain = state.lastAnalyzedDomain
                  ? extractRootDomain(state.lastAnalyzedDomain)
                  : null;

                const isNewRootDomain = !lastRootDomain || lastRootDomain !== rootDomain;
                const isNewUrl = previousUrl !== currentUrl;
                const contentChanged =
                  previousContentHash && previousContentHash !== state.lastContentHash;
                if (!state.forceRefresh && !isNewRootDomain && !isNewUrl && !contentChanged) {
                  if (aiLoading) aiLoading.classList.add('hidden');
                  if (aiData) aiData.classList.add('hidden');
                  showContentBlocked(
                    'Click the refresh button to generate fresh insights for this page.'
                  );
                  resolve();
                  return;
                }

                if (aiLoading) aiLoading.classList.remove('hidden');
                if (aiData) aiData.classList.add('hidden');
                setLoadingMessage('Generating AI insights...');

                if (!response.content.paragraphs?.length && !response.content.headings?.length) {
                  showContentBlocked('Not enough readable content to generate insights.');
                  resolve();
                  return;
                }

                const urlObj = new URL(response.content.url);
                const isInternal =
                  urlObj.hostname === 'signalizeai.org' ||
                  urlObj.hostname === 'www.signalizeai.org' ||
                  urlObj.hostname === 'signalizeaipay.lemonsqueezy.com';

                const domainAnalyzedToday = await wasDomainAnalyzedToday(currentDomain);

                const result = await analyzeWebsiteContent(
                  response.content,
                  isInternal,
                  domainAnalyzedToday
                );

                if (result.quota) {
                  state.currentPlan = result.quota.plan;
                  state.usedToday = result.quota.used_today;
                  state.remainingToday = result.quota.remaining_today;
                  state.dailyLimitFromAPI = result.quota.daily_limit;
                  state.maxSavedLimit = result.quota.max_saved;
                  state.totalSavedCount = result.quota.total_saved;
                  renderQuotaBanner();
                }

                if (result.blocked) {
                  document.getElementById('ai-loading')?.classList.add('hidden');
                  document.getElementById('ai-data')?.classList.add('hidden');
                  endAnalysisLoading();
                  showLimitModal('analysis');
                  resolve();
                  return;
                }

                if (!result.analysis) {
                  showContentBlocked('Failed to generate prospect data');
                  endAnalysisLoading();
                  resolve();
                  return;
                }

                const analysis = result.analysis;
                const savedIdToInvalidate =
                  existing?.id ||
                  (document.getElementById('saveButton') as HTMLButtonElement | null)?.dataset
                    .savedId ||
                  null;

                if (state.forceRefresh) {
                  await clearSavedOutreachAfterRefresh(savedIdToInvalidate);
                  await clearCachedOutreachAfterRefresh();
                }

                state.lastAnalysis = analysis;
                displayAIAnalysis(
                  analysis,
                  getReusableOutreachPayload({
                    existingPayload: existing?.outreach_angles,
                    previousDomain,
                    currentDomain,
                  })
                );
                state.lastAnalyzedDomain = currentDomain;
                markDomainAnalyzedToday(currentDomain);

                setCachedAnalysis(currentUrl, {
                  analysis,
                  meta: state.lastExtractedMeta,
                  outreachPayload: undefined,
                });
                setCachedAnalysisByDomain(currentDomain, {
                  analysis,
                  meta: state.lastExtractedMeta,
                  outreachPayload: undefined,
                });

                if (existing && isHomepageUrl(currentUrl)) {
                  const { error: updateError } = await supabase
                    .from('saved_analyses')
                    .update({
                      content_hash: state.lastContentHash,
                      last_analyzed_at: new Date().toISOString(),
                      title: state.lastExtractedMeta.title,
                      description: state.lastExtractedMeta.description,
                      url: state.lastExtractedMeta.url,
                      what_they_do: analysis.whatTheyDo,
                      target_customer: analysis.targetCustomer,
                      value_proposition: analysis.valueProposition,
                      sales_readiness_score: analysis.salesReadinessScore,
                      best_sales_persona: analysis.bestSalesPersona?.persona,
                      best_sales_persona_reason: analysis.bestSalesPersona?.reason,
                      recommended_outreach_goal: analysis.recommendedOutreach?.goal,
                      recommended_outreach_angle: buildPersistedOutreachAngle(analysis),
                    })
                    .eq('id', existing.id);

                  if (updateError) {
                    console.error('Failed to update saved prospect:', updateError);
                    showToast('Failed to update saved prospect. Try again.');
                  }
                }
                resolve();
              }
            } catch (err: any) {
              showContentBlocked('Failed to generate insights for this page: ' + err.message);
              endAnalysisLoading();
              resolve();
            }
          } else if (response?.reason === 'THIN_CONTENT') {
            endAnalysisLoading();
            showContentBlocked('This page has limited public content.', {
              allowHomepageFallback: true,
              originalUrl: tab.url,
            });
            resolve();
            return;
          } else if (response?.reason === 'RESTRICTED') {
            endAnalysisLoading();
            showContentBlocked(
              'This page requires login or consent before insights can be generated.',
              {
                allowHomepageFallback: true,
                originalUrl: tab.url,
              }
            );
            resolve();
            return;
          } else {
            if (response.error) {
              showContentBlocked(`Error: ${response.error}`);
            } else {
              showContentBlocked('Unable to generate insights for this page.');
            }
          }
          resolve();
        }
      );
    });
  } catch {
    endAnalysisLoading();
  }
}

export async function getHomepageAnalysisForSave(url: string): Promise<any> {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    return { error: 'No active session' };
  }

  await loadQuotaFromAPI();

  if (state.currentPlan === 'free' && state.remainingToday !== null && state.remainingToday <= 0) {
    showLimitModal('analysis');
    return { blocked: true };
  }

  const tab = await getActiveTab();
  if (!tab?.id) {
    return { error: 'No active tab' };
  }

  const scriptLoaded = await ensureContentScriptLoaded(tab.id);
  if (!scriptLoaded) {
    return { error: 'Unable to load content script' };
  }

  const response = await new Promise<ContentResponse>((resolve) => {
    chrome.tabs.sendMessage(
      tab.id!,
      {
        type: 'EXTRACT_WEBSITE_CONTENT',
        overrideUrl: url,
      },
      (result) => resolve(result)
    );
  });

  if (!response?.ok || !response.content) {
    return { error: 'Unable to generate homepage insights.' };
  }

  const meta: ExtractedMeta = {
    title: cleanTitle(response.content.title),
    description: response.content.metaDescription,
    url: response.content.url,
    domain: new URL(response.content.url).hostname,
  };

  const contentHash = await hashContent(response.content);
  const urlObj = new URL(response.content.url);
  const isInternal =
    urlObj.hostname === 'signalizeai.org' ||
    urlObj.hostname === 'www.signalizeai.org' ||
    urlObj.hostname === 'signalizeaipay.lemonsqueezy.com';
  const domainAnalyzedToday = await wasDomainAnalyzedToday(meta.domain);
  const result = await analyzeWebsiteContent(response.content, isInternal, domainAnalyzedToday);

  if (result.quota) {
    state.currentPlan = result.quota.plan;
    state.usedToday = result.quota.used_today;
    state.remainingToday = result.quota.remaining_today;
    state.dailyLimitFromAPI = result.quota.daily_limit;
    state.maxSavedLimit = result.quota.max_saved;
    state.totalSavedCount = result.quota.total_saved;
    renderQuotaBanner();
  }

  if (result.blocked) {
    showLimitModal('analysis');
    return { blocked: true };
  }

  if (!result.analysis) {
    return { error: 'Failed to generate prospect data' };
  }

  const analysis = result.analysis;
  markDomainAnalyzedToday(meta.domain);
  setCachedAnalysis(meta.url, {
    analysis,
    meta,
  });
  setCachedAnalysisByDomain(meta.domain, {
    analysis,
    meta,
  });

  return { analysis, meta, contentHash };
}

export async function analyzeSpecificUrl(
  url: string,
  options?: { preserveSavedId?: string | null }
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;

  await loadQuotaFromAPI();

  if (state.currentPlan === 'free' && state.remainingToday !== null && state.remainingToday <= 0) {
    showLimitModal('analysis');
    return;
  }

  const aiCard = document.getElementById('ai-analysis');
  const contentLoading = document.getElementById('ai-loading');
  const contentError = document.getElementById('content-error');
  const aiData = document.getElementById('ai-data');

  if (contentError) contentError.classList.add('hidden');
  if (aiData) aiData.classList.add('hidden');
  if (aiCard) aiCard.classList.remove('hidden');
  if (contentLoading) contentLoading.classList.remove('hidden');
  document.getElementById('empty-tab-view')?.classList.add('hidden');
  setLoadingMessage(
    "Hold on, we're opening the site in the background, generating insights, then we'll show you the results..."
  );
  state.isAnalysisLoading = true;

  try {
    const previousDomain = state.lastExtractedMeta?.domain || null;
    const saveBtn = document.getElementById('saveButton') as HTMLButtonElement | null;
    if (saveBtn && !options?.preserveSavedId) {
      saveBtn.classList.remove('active');
      saveBtn.title = 'Save';
      delete saveBtn.dataset.savedId;
    }
    if (!options?.preserveSavedId) {
      updateAnalysisDashboardButton(null);
    }

    const response = await fetchAndExtractContent(url);

    if (contentLoading) contentLoading.classList.add('hidden');
    state.isAnalysisLoading = false;

    if (!response?.ok || !response.content) {
      showContentBlocked(
        response?.error || response?.reason || 'Unable to generate insights for the provided URL.'
      );
      return;
    }

    state.lastExtractedMeta = {
      title: cleanTitle(response.content.title),
      description: response.content.metaDescription,
      url: response.content.url,
      domain: new URL(response.content.url).hostname,
    };
    state.lastExtractedEvidence = {
      title: cleanTitle(response.content.title),
      metaDescription: response.content.metaDescription,
      headings: response.content.headings || [],
      paragraphs: response.content.paragraphs || [],
    };

    state.lastContentHash = await hashContent(response.content);
    state.lastAnalyzedDomain = state.lastExtractedMeta.domain;
    const existingSaved = await fetchSavedProspectByDomain(state.lastAnalyzedDomain);
    if (existingSaved && !state.forceRefresh) {
      displaySavedProspectRow(existingSaved);
      return;
    }
    const settings = await loadSettings();
    const reuseAllowed = settings.reanalysisMode === 'content-change' && !state.forceRefresh;
    const cached = await getCachedAnalysisByDomain(state.lastAnalyzedDomain);

    if (reuseAllowed && cached) {
      state.lastAnalysis = cached.analysis;
      state.lastExtractedMeta = {
        ...cached.meta,
        url,
        domain: state.lastAnalyzedDomain,
      };
      const currentMeta = state.lastExtractedMeta;
      if (state.lastAnalysis) {
        displayAIAnalysis(
          state.lastAnalysis,
          getReusableOutreachPayload({
            existingPayload: existingSaved?.outreach_angles || cached.outreachPayload,
            previousDomain,
            currentDomain: state.lastAnalyzedDomain,
          })
        );
      }
      if (options?.preserveSavedId && currentMeta) {
        await updateSavedProspectAnalysis(
          options.preserveSavedId,
          currentMeta,
          state.lastAnalysis!,
          state.lastContentHash
        );
        const saveBtn = document.getElementById('saveButton') as HTMLButtonElement | null;
        if (saveBtn) {
          saveBtn.classList.add('active');
          saveBtn.title = 'Remove';
          saveBtn.dataset.savedId = options.preserveSavedId;
        }
        updateAnalysisDashboardButton(options.preserveSavedId);
      } else {
        await refreshSaveButtonState();
      }
      return;
    }

    if (contentLoading) contentLoading.classList.remove('hidden');
    setLoadingMessage('Generating AI insights...');

    const urlObj = new URL(response.content.url);
    const isInternal =
      urlObj.hostname === 'signalizeai.org' ||
      urlObj.hostname === 'www.signalizeai.org' ||
      urlObj.hostname === 'signalizeaipay.lemonsqueezy.com';
    const domainAnalyzedToday = await wasDomainAnalyzedToday(state.lastAnalyzedDomain);
    const result = await analyzeWebsiteContent(response.content, isInternal, domainAnalyzedToday);

    if (result.quota) {
      state.currentPlan = result.quota.plan;
      state.usedToday = result.quota.used_today;
      state.remainingToday = result.quota.remaining_today;
      state.dailyLimitFromAPI = result.quota.daily_limit;
      state.maxSavedLimit = result.quota.max_saved;
      state.totalSavedCount = result.quota.total_saved;
      renderQuotaBanner();
    }

    if (result.blocked) {
      endAnalysisLoading();
      showLimitModal('analysis');
      return;
    }

    state.lastAnalysis = result.analysis!;
    const currentMeta = state.lastExtractedMeta;
    displayAIAnalysis(
      result.analysis!,
      getReusableOutreachPayload({
        existingPayload: existingSaved?.outreach_angles,
        previousDomain,
        currentDomain: state.lastAnalyzedDomain,
      })
    );
    markDomainAnalyzedToday(state.lastAnalyzedDomain);

    setCachedAnalysis(state.lastExtractedMeta.url, {
      analysis: result.analysis!,
      meta: state.lastExtractedMeta,
      outreachPayload: undefined,
    });
    setCachedAnalysisByDomain(state.lastAnalyzedDomain, {
      analysis: result.analysis!,
      meta: state.lastExtractedMeta,
      outreachPayload: undefined,
    });

    if (options?.preserveSavedId && currentMeta) {
      await updateSavedProspectAnalysis(
        options.preserveSavedId,
        currentMeta,
        result.analysis!,
        state.lastContentHash
      );
      const saveBtn = document.getElementById('saveButton') as HTMLButtonElement | null;
      if (saveBtn) {
        saveBtn.classList.add('active');
        saveBtn.title = 'Remove';
        saveBtn.dataset.savedId = options.preserveSavedId;
      }
      updateAnalysisDashboardButton(options.preserveSavedId);
    } else {
      await refreshSaveButtonState();
    }
  } catch (err: any) {
    if (contentLoading) contentLoading.classList.add('hidden');
    state.isAnalysisLoading = false;
    showContentBlocked('Failed to generate insights for the URL: ' + err.message);
  }
}

export async function reanalyzeCurrentContext(): Promise<void> {
  const tab = await getActiveTab();
  const savedId = tab?.url ? getProspectRouteSavedId(tab.url) : null;

  if (savedId) {
    await reanalyzeSavedProspectFromRoute(savedId);
    return;
  }

  await extractWebsiteContent();
}

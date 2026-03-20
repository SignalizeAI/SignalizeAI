import type { OutreachAnglesResult } from './outreach-messages/types.js';

export interface PendingDelete {
  element: HTMLElement;
  finalize: () => Promise<void>;
}

export interface ExtractedMeta {
  title: string;
  description: string;
  url: string;
  domain: string;
}

export interface ExtractedEvidence {
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

export interface BestSalesPersona {
  persona: string;
  reason: string;
}

export interface RecommendedOutreach {
  persona: string;
  goal: string;
  angle: string;
  message: string;
}

export interface Analysis {
  whatTheyDo: string;
  targetCustomer: string;
  valueProposition: string;
  salesAngle: string;
  salesReadinessScore: number;
  bestSalesPersona: BestSalesPersona;
  recommendedOutreach: RecommendedOutreach;
}

export interface ActiveFilters {
  minScore: number;
  maxScore: number;
  persona: string;
  searchQuery: string;
  sort: string;
}

export interface State {
  lastContentHash: string | null;
  lastAnalysis: Analysis | null;
  lastExtractedMeta: ExtractedMeta | null;
  lastExtractedEvidence: ExtractedEvidence | null;
  lastAnalyzedDomain: string | null;
  forceRefresh: boolean;
  currentView: 'analysis' | 'saved' | 'batch' | 'profile' | 'settings' | null;
  selectionMode: boolean;
  lastSelectedIndex: number | null;
  selectedSavedIds: Set<string>;
  isRangeSelecting: boolean;
  isFinalizingDeletes: boolean;
  isUndoToastActive: boolean;
  pendingDeleteMap: Map<string, PendingDelete>;
  undoTimer: ReturnType<typeof setTimeout> | null;
  totalFilteredCount: number;
  currentPage: number;
  currentPlan: string | null;
  remainingToday: number | null;
  usedToday: number | null;
  maxSavedLimit: number;
  totalSavedCount: number;
  dailyLimitFromAPI: number;
  isUserInteracting: boolean;
  dropdownOpenedAt: number;
  isAnalysisLoading: boolean;
  lastQuotaFetch: number;
  lastAutoAnalyzeAt: number;
  activeFilters: ActiveFilters;
  outreachAngles: OutreachAnglesResult | null;
  outreachAnglesLoading: boolean;
  currentUserName: string;
}

export const state: State = {
  lastContentHash: null,
  lastAnalysis: null,
  lastExtractedMeta: null,
  lastExtractedEvidence: null,
  lastAnalyzedDomain: null,
  forceRefresh: false,
  currentView: 'analysis',
  selectionMode: false,
  lastSelectedIndex: null,
  selectedSavedIds: new Set(),
  isRangeSelecting: false,
  isFinalizingDeletes: false,
  isUndoToastActive: false,
  pendingDeleteMap: new Map(),
  undoTimer: null,
  totalFilteredCount: 0,
  currentPage: 1,
  currentPlan: 'free',
  remainingToday: null,
  usedToday: null,
  maxSavedLimit: 5,
  totalSavedCount: 0,
  dailyLimitFromAPI: 5,
  isUserInteracting: false,
  dropdownOpenedAt: 0,
  isAnalysisLoading: false,
  lastQuotaFetch: 0,
  lastAutoAnalyzeAt: 0,
  activeFilters: {
    minScore: 0,
    maxScore: 100,
    persona: '',
    searchQuery: '',
    sort: 'created_at_desc',
  },
  outreachAngles: null,
  outreachAnglesLoading: false,
  currentUserName: '',
};

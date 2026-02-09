import {
  DESELECT_ALL_ICON,
  INDETERMINATE_ICON,
  PAGE_SIZE,
  SELECT_ALL_ICON
} from "./constants.js";
import { buildSavedCopyText, copyAnalysisText } from "./clipboard.js";
import { loadSettings } from "./settings.js";
import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";
import { loadQuotaFromAPI } from "./quota.js";

const multiSelectToggle = document.getElementById("multi-select-toggle");
const selectionBackBtn = document.getElementById("selection-back-btn");
const selectAllBtn = document.getElementById("select-all-btn");
const exportToggle = document.getElementById("export-menu-toggle");
const filterToggle = document.getElementById("filter-toggle");

export function updateDeleteState() {
  if (!multiSelectToggle) return;

  const countIndicator = document.getElementById("selection-count-indicator");
  const count = state.selectedSavedIds.size;

  const totalVisible = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter((item) => !item.classList.contains("pending-delete")).length;

  if (countIndicator) {
    if (state.selectionMode && count > 0) {
      countIndicator.textContent =
        count === totalVisible ? `All (${count})` : `(${count})`;
      countIndicator.classList.remove("hidden");
    } else {
      countIndicator.classList.add("hidden");
    }
  }

  const shouldDisable = state.selectionMode && count === 0;
  multiSelectToggle.classList.toggle("disabled", shouldDisable);
  multiSelectToggle.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
}

export function updateSavedActionsVisibility(count) {
  const searchToggleBtn = document.getElementById("search-toggle");

  const showBasicActions = count > 0 ? "" : "none";
  if (filterToggle) filterToggle.style.display = showBasicActions;
  if (exportToggle) exportToggle.style.display = showBasicActions;

  if (searchToggleBtn) {
    searchToggleBtn.style.display = count > 1 ? "" : "none";
  }

  if (multiSelectToggle) {
    multiSelectToggle.style.display = count > 1 ? "" : "none";
  }
}

export function updateSavedEmptyState(visibleCount = null) {
  if (visibleCount === null) {
    visibleCount = Array.from(
      document.querySelectorAll("#saved-list .saved-item")
    ).filter((item) => !item.classList.contains("pending-delete")).length;
  }
  const emptyEl = document.getElementById("saved-empty");
  const filterEmptyEl = document.getElementById("filter-empty");

  const isFiltering = areFiltersActive();

  if (state.totalFilteredCount === 0 && !isFiltering) {
    emptyEl.classList.remove("hidden");
    filterEmptyEl.classList.add("hidden");
  } else if (state.totalFilteredCount === 0 && isFiltering) {
    emptyEl.classList.add("hidden");
    filterEmptyEl.classList.remove("hidden");
  } else {
    emptyEl.classList.add("hidden");
    filterEmptyEl.classList.add("hidden");
  }

  updateSavedActionsVisibility(visibleCount);
}

function toggleItemSelectionUI(itemEl, enable) {
  const checkbox = itemEl.querySelector(".saved-select-checkbox");
  const copyBtn = itemEl.querySelector(".copy-saved-btn");
  const deleteBtn = itemEl.querySelector(".delete-saved-btn");

  if (enable) {
    checkbox?.classList.remove("hidden");
    copyBtn?.classList.add("hidden");
    deleteBtn?.classList.add("hidden");
  } else {
    if (checkbox) checkbox.checked = false;
    checkbox?.classList.add("hidden");
    copyBtn?.classList.remove("hidden");
    deleteBtn?.classList.remove("hidden");
  }
}

export function updateSelectionUI() {
  document.querySelectorAll(".saved-item").forEach((item) =>
    toggleItemSelectionUI(item, state.selectionMode)
  );

  if (exportToggle) {
    exportToggle.classList.toggle("hidden", state.selectionMode);
  }

  if (filterToggle) {
    filterToggle.classList.toggle("hidden", state.selectionMode);
  }

  if (selectionBackBtn) {
    selectionBackBtn.classList.toggle("hidden", !state.selectionMode);
  }

  if (selectAllBtn) {
    selectAllBtn.classList.toggle("hidden", !state.selectionMode);

    if (state.selectionMode) {
      updateSelectAllIcon();
    }
  }

  const countIndicator = document.getElementById("selection-count-indicator");

  if (countIndicator) {
    if (!state.selectionMode) {
      countIndicator.classList.add("hidden");
    } else {
      updateDeleteState();
    }
  }

  if (!multiSelectToggle) return;

  if (state.selectionMode) {
    multiSelectToggle.title = "Delete selected";
    multiSelectToggle.setAttribute("aria-label", "Delete selected analyses");
    multiSelectToggle.innerHTML = `
      <svg
        class="multi-select-icon danger"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
      </svg>
    `;
  } else {
    multiSelectToggle.title = "Select multiple";
    multiSelectToggle.setAttribute("aria-label", "Select multiple analyses");
    multiSelectToggle.innerHTML = `
      <svg
        class="multi-select-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="3"></rect>
        <path d="M9 12l2 2 4-4"></path>
      </svg>
    `;
  }
}

export function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedSavedIds.clear();
  state.lastSelectedIndex = null;
  if (selectAllBtn) {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    selectAllBtn.title = "Select all";
  }

  document
    .querySelectorAll(".saved-item.selected")
    .forEach((el) => el.classList.remove("selected"));

  const visibleCount = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter((item) => !item.classList.contains("pending-delete")).length;
  updateSelectionUI();
  updateDeleteState();
  updateSavedActionsVisibility(visibleCount);
}

export function toggleSelectAllVisible() {
  const items = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter((item) => !item.classList.contains("pending-delete"));

  if (!items.length) return;

  const selectedCount = items.filter(
    (item) => item.querySelector(".saved-select-checkbox")?.checked
  ).length;

  const shouldSelectAll = selectedCount < items.length;

  items.forEach((item) => {
    const cb = item.querySelector(".saved-select-checkbox");
    if (!cb) return;

    if (cb.checked !== shouldSelectAll) {
      cb.checked = shouldSelectAll;
      const wrapper = item.closest(".saved-item");
      wrapper.classList.toggle("selected", shouldSelectAll);
      if (shouldSelectAll) state.selectedSavedIds.add(cb.dataset.id);
      else state.selectedSavedIds.delete(cb.dataset.id);
    }
  });

  updateDeleteState();
  updateSelectAllIcon();
}

export function updateSelectAllIcon() {
  if (!selectAllBtn || !state.selectionMode) return;

  const items = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter((item) => !item.classList.contains("pending-delete"));

  if (!items.length) {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    return;
  }

  const selectedCount = items.filter((item) => {
    const cb = item.querySelector(".saved-select-checkbox");
    return cb?.checked;
  }).length;

  const allSelected = selectedCount === items.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < items.length;

  if (allSelected) {
    selectAllBtn.innerHTML = DESELECT_ALL_ICON;
    selectAllBtn.title = "Deselect all";
  } else if (isIndeterminate) {
    selectAllBtn.innerHTML = INDETERMINATE_ICON;
    selectAllBtn.title = "Select all";
  } else {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    selectAllBtn.title = "Select all";
  }
}

export function renderSavedItem(item) {
  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char])
    );

  const escapedTitle = escapeHtml(item.title || item.domain || "");
  const escapedDescription = escapeHtml(item.description || "—");

  const wrapper = document.createElement("div");
  wrapper.dataset.salesScore = Number(item.sales_readiness_score ?? 0);
  wrapper.dataset.persona = (item.best_sales_persona || "").toLowerCase().trim();
  wrapper.className = "saved-item";

  wrapper.innerHTML = `
  <div class="saved-item-header">
    <div class="header-info">
      <strong>${escapedTitle}</strong>
      <div style="font-size:12px; opacity:0.7">${item.domain}</div>
    </div>

    <div class="header-actions">
      <button class="copy-btn copy-saved-btn" title="Copy analysis">
        <svg viewBox="0 0 24 24" class="copy-icon">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>

      <button class="delete-saved-btn" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </div>
      <input
        type="checkbox"
        class="saved-select-checkbox hidden"
        data-id="${item.id}"
        aria-label="Select saved analysis ${item.title || item.domain}"
      />
  </div>

  <div class="saved-item-body hidden">
    <p><strong>Sales readiness:</strong> ${item.sales_readiness_score ?? "—"}</p>
    <p><strong>What they do:</strong> ${item.what_they_do || "—"}</p>
    <p><strong>Target customer:</strong> ${item.target_customer || "—"}</p>
    <p><strong>Value proposition:</strong> ${item.value_proposition || "—"}</p>
    <p>
      <strong>Best sales persona:</strong> ${item.best_sales_persona || "—"}
      <span style="opacity:0.7; font-size:13px">
        ${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ""}
      </span>
    </p>
    <p><strong>Sales angle:</strong> ${item.sales_angle || "—"}</p>

    <hr style="margin:10px 0; opacity:0.25" />

    <p><strong>Recommended outreach</strong></p>

    <p>
      <strong>Who:</strong>
      ${item.recommended_outreach_persona || "—"}
    </p>

    <p>
      <strong>Goal:</strong>
      ${item.recommended_outreach_goal || "—"}
    </p>

    <p>
      <strong>Angle:</strong>
      ${item.recommended_outreach_angle || "—"}
    </p>

    <p style="opacity:0.9; font-size:13px">
      <strong>Message:</strong><br />
      ${item.recommended_outreach_message || "—"}
    </p>

    <hr style="margin:8px 0; opacity:0.3" />

    <p style="opacity:0.85">
      <strong>Company overview:</strong>
      ${escapedDescription}
    </p>

    ${
      item.url
        ? `
          <p>
            <strong>URL:</strong>
            <a
              href="${item.url}"
              target="_blank"
              class="saved-url"
            >
              ${item.url}
            </a>
          </p>
        `
        : ""
    }
  </div>
`;

  const header = wrapper.querySelector(".saved-item-header");
  const body = wrapper.querySelector(".saved-item-body");
  const checkbox = wrapper.querySelector(".saved-select-checkbox");

  const copySavedBtn = wrapper.querySelector(".copy-saved-btn");

  copySavedBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === "short" ? "short" : "full";

    const text = await buildSavedCopyText(item);
    copyAnalysisText(text, copySavedBtn, formatLabel);
  });

  const handleSelection = (isShift, forceState = null) => {
    const items = Array.from(
      document.querySelectorAll("#saved-list .saved-item")
    ).filter((i) => !i.classList.contains("pending-delete"));

    const currentIndex = items.indexOf(wrapper);
    const shouldSelect = forceState !== null ? forceState : checkbox.checked;

    if (state.selectionMode && isShift && state.lastSelectedIndex !== null) {
      const [start, end] = [
        Math.min(state.lastSelectedIndex, currentIndex),
        Math.max(state.lastSelectedIndex, currentIndex)
      ];
      state.isRangeSelecting = true;
      items.slice(start, end + 1).forEach((itemEl) => {
        const cb = itemEl.querySelector(".saved-select-checkbox");
        if (cb) {
          cb.checked = shouldSelect;
          itemEl.classList.toggle("selected", shouldSelect);
          if (shouldSelect) state.selectedSavedIds.add(cb.dataset.id);
          else state.selectedSavedIds.delete(cb.dataset.id);
        }
      });
      state.isRangeSelecting = false;
    } else {
      checkbox.checked = shouldSelect;
      wrapper.classList.toggle("selected", shouldSelect);
      if (shouldSelect) state.selectedSavedIds.add(checkbox.dataset.id);
      else state.selectedSavedIds.delete(checkbox.dataset.id);
    }
    state.lastSelectedIndex = currentIndex;
    updateDeleteState();
    updateSelectAllIcon();
  };

  checkbox?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleSelection(e.shiftKey);
  });

  wrapper.querySelector(".delete-saved-btn").addEventListener("click", (e) => {
    if (state.selectionMode || state.isUndoToastActive) return;
    e.stopPropagation();

    const itemId = item.id;

    wrapper.dataset.isPendingDelete = "true";
    wrapper.classList.add("pending-delete");

    state.pendingDeleteMap.set(itemId, {
      element: wrapper,
      finalize: async () => {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user) return;

        await supabase
          .from("saved_analyses")
          .delete()
          .eq("user_id", data.session.user.id)
          .eq("id", itemId);

        wrapper.remove();
      }
    });

    showUndoToast();
  });

  let pressTimer;
  let preventNextClick = false;

  const startPress = (e) => {
    if (state.selectionMode || (e.type === "mousedown" && e.button !== 0)) return;

    const visibleItems = Array.from(
      document.querySelectorAll("#saved-list .saved-item")
    ).filter(
      (item) =>
        !item.classList.contains("pending-delete") &&
        item.dataset.isPendingDelete !== "true"
    );

    if (visibleItems.length <= 1) return;

    preventNextClick = false;

    pressTimer = setTimeout(() => {
      enterSelectionModeFromItem();
    }, 600);
  };

  const cancelPress = () => {
    clearTimeout(pressTimer);
  };

  const enterSelectionModeFromItem = () => {
    state.selectionMode = true;
    preventNextClick = true;
    updateSelectionUI();
    handleSelection(false, true);
  };

  header.addEventListener("mousedown", startPress);
  header.addEventListener("mouseup", cancelPress);
  header.addEventListener("mouseleave", cancelPress);

  header.addEventListener("touchstart", startPress, { passive: true });
  header.addEventListener("touchend", cancelPress);
  header.addEventListener("touchcancel", cancelPress);

  header.addEventListener(
    "click",
    (e) => {
      if (preventNextClick) {
        e.preventDefault();
        e.stopPropagation();
        preventNextClick = false;
        return;
      }

      if (state.selectionMode) {
        if (e.target === checkbox) return;
        handleSelection(e.shiftKey, !checkbox.checked);
        return;
      }

      if (e.target.closest(".delete-saved-btn") || e.target.closest(".copy-saved-btn")) {
        return;
      }

      const container = wrapper.parentElement;
      if (container) {
        container.querySelectorAll(".saved-item-body").forEach((other) => {
          if (other !== body) other.classList.add("hidden");
        });
      }

      body.classList.toggle("hidden");
    },
    true
  );

  return wrapper;
}

function exportToCSV(rows) {
  if (!rows.length) return;

  const csvEscape = (value) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const headers = [
    "Title",
    "Domain",
    "URL",
    "Description",
    "Sales Readiness Score",
    "What They Do",
    "Target Customer",
    "Value Proposition",
    "Best Sales Persona",
    "Persona Reason",
    "Sales Angle",
    "Outreach Persona",
    "Outreach Goal",
    "Outreach Angle",
    "Outreach Message",
    "Saved At"
  ];

  const csvRows = [
    headers.map(csvEscape).join(","),
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
        csvEscape(item.created_at)
      ].join(",")
    )
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "signalizeai_saved_analyses.csv";
  a.click();

  URL.revokeObjectURL(url);
}

async function exportToExcel(rows) {
  if (!rows.length) return;

  const { default: ExcelJS } = await import("exceljs/dist/exceljs.min.js");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Saved Analyses");

  sheet.columns = [
    { header: "Title", key: "title", width: 30 },
    { header: "Domain", key: "domain", width: 22 },
    { header: "URL", key: "url", width: 35 },
    { header: "Description", key: "description", width: 40 },
    { header: "Sales Readiness", key: "sales_readiness_score", width: 18 },
    { header: "What They Do", key: "what_they_do", width: 35 },
    { header: "Target Customer", key: "target_customer", width: 30 },
    { header: "Value Proposition", key: "value_proposition", width: 35 },
    { header: "Best Sales Persona", key: "best_sales_persona", width: 22 },
    { header: "Persona Reason", key: "best_sales_persona_reason", width: 30 },
    { header: "Sales Angle", key: "sales_angle", width: 35 },
    { header: "Outreach Persona", key: "recommended_outreach_persona", width: 24 },
    { header: "Outreach Goal", key: "recommended_outreach_goal", width: 30 },
    { header: "Outreach Angle", key: "recommended_outreach_angle", width: 35 },
    { header: "Outreach Message", key: "recommended_outreach_message", width: 45 },
    { header: "Saved At", key: "created_at", width: 22 }
  ];

  rows.forEach((item) => sheet.addRow(item));

  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "signalizeai_saved_analyses.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadSavedAnalyses() {
  state.currentPage = 1;
  exitSelectionMode();
  state.lastSelectedIndex = null;

  const listEl = document.getElementById("saved-list");
  const loadingEl = document.getElementById("saved-loading");
  const emptyEl = document.getElementById("saved-empty");

  listEl.innerHTML = "";
  loadingEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  await fetchAndRenderPage();
}

export async function fetchAndRenderPage() {
  const listEl = document.getElementById("saved-list");
  const loadingEl = document.getElementById("saved-loading");

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  loadingEl.classList.remove("hidden");
  listEl.innerHTML = "";

  let countQuery = supabase
    .from("saved_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (state.activeFilters.minScore > 0) {
    countQuery = countQuery.gte("sales_readiness_score", state.activeFilters.minScore);
  }

  if (state.activeFilters.maxScore < 100) {
    countQuery = countQuery.lte("sales_readiness_score", state.activeFilters.maxScore);
  }

  if (state.activeFilters.persona) {
    countQuery = countQuery.ilike(
      "best_sales_persona",
      `%${state.activeFilters.persona}%`
    );
  }

  if (state.activeFilters.searchQuery) {
    const q = `%${state.activeFilters.searchQuery}%`;
    countQuery = countQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error(countError);
    loadingEl.classList.add("hidden");
    return;
  }

  state.totalFilteredCount = count || 0;

  let dataQuery = supabase
    .from("saved_analyses")
    .select(
      `
      *,
      recommended_outreach_persona,
      recommended_outreach_goal,
      recommended_outreach_angle,
      recommended_outreach_message
    `
    )
    .eq("user_id", user.id);

  if (state.activeFilters.minScore > 0) {
    dataQuery = dataQuery.gte("sales_readiness_score", state.activeFilters.minScore);
  }
  if (state.activeFilters.maxScore < 100) {
    dataQuery = dataQuery.lte("sales_readiness_score", state.activeFilters.maxScore);
  }
  if (state.activeFilters.persona) {
    dataQuery = dataQuery.ilike(
      "best_sales_persona",
      `%${state.activeFilters.persona}%`
    );
  }
  if (state.activeFilters.searchQuery) {
    const q = `%${state.activeFilters.searchQuery}%`;
    dataQuery = dataQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const from = (state.currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let sortColumn = "created_at";
  let sortAsc = false;

  switch (state.activeFilters.sort) {
    case "created_at_asc":
      sortColumn = "created_at";
      sortAsc = true;
      break;

    case "created_at_desc":
      sortColumn = "created_at";
      sortAsc = false;
      break;

    case "last_analyzed_at_desc":
      sortColumn = "last_analyzed_at";
      sortAsc = false;
      break;

    case "sales_readiness_score_desc":
      sortColumn = "sales_readiness_score";
      sortAsc = false;
      break;

    case "sales_readiness_score_asc":
      sortColumn = "sales_readiness_score";
      sortAsc = true;
      break;

    case "title_asc":
      sortColumn = "title";
      sortAsc = true;
      break;

    case "title_desc":
      sortColumn = "title";
      sortAsc = false;
      break;
  }

  const { data, error } = await dataQuery
    .order(sortColumn, { ascending: sortAsc })
    .range(from, to);

  loadingEl.classList.add("hidden");

  if (error) {
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    updateSavedEmptyState(0);
    renderPagination(0);
    return;
  }

  data.forEach((row) => {
    listEl.appendChild(renderSavedItem(row));
  });

  updateSavedEmptyState(data.length);
  renderPagination(Math.ceil(state.totalFilteredCount / PAGE_SIZE));
  updateFilterBanner();
}

export function renderPagination(totalPages) {
  const bar = document.getElementById("pagination-bar");
  const container = document.getElementById("page-numbers");

  if (!bar || !container) return;

  container.innerHTML = "";

  if (totalPages <= 1) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");

  const maxVisible = 5;

  let start = Math.max(1, state.currentPage - 2);
  let end = Math.min(totalPages, state.currentPage + 2);

  if (end - start < maxVisible - 1) {
    if (start === 1) {
      end = Math.min(totalPages, start + maxVisible - 1);
    } else if (end === totalPages) {
      start = Math.max(1, end - maxVisible + 1);
    }
  }

  if (start > 1) {
    container.appendChild(makePageBtn(1));
    if (start > 2) container.appendChild(makeEllipsis());
  }

  for (let i = start; i <= end; i++) {
    container.appendChild(makePageBtn(i));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) container.appendChild(makeEllipsis());
    container.appendChild(makePageBtn(totalPages));
  }
}

function makePageBtn(page) {
  const btn = document.createElement("button");
  btn.textContent = page;
  btn.className = "page-number" + (page === state.currentPage ? " active" : "");
  btn.onclick = async () => {
    state.currentPage = page;
    await fetchAndRenderPage();
  };
  return btn;
}

function makeEllipsis() {
  const span = document.createElement("span");
  span.textContent = "…";
  span.className = "page-ellipsis";
  return span;
}

export async function fetchSavedAnalysesData() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from("saved_analyses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

export function areFiltersActive() {
  return (
    state.activeFilters.minScore > 0 ||
    state.activeFilters.maxScore < 100 ||
    state.activeFilters.persona !== "" ||
    (state.activeFilters.searchQuery &&
      state.activeFilters.searchQuery.length > 0) ||
    state.activeFilters.sort !== "created_at_desc"
  );
}

export function updateFilterBanner() {
  const banner = document.getElementById("active-filter-banner");
  const text = document.getElementById("filter-banner-text");

  if (!banner || !text) return;

  const isFiltering = areFiltersActive();
  const isNoResults = state.totalFilteredCount === 0;

  if (isFiltering && !isNoResults) {
    const shownSoFar = Math.min(
      state.currentPage * PAGE_SIZE,
      state.totalFilteredCount
    );

    banner.classList.remove("hidden");
    text.textContent = formatResultsText(shownSoFar, state.totalFilteredCount);
  } else {
    banner.classList.add("hidden");
  }
}

export function formatResultsText(shown, total) {
  if (total === 0) return "";

  if (total <= PAGE_SIZE) {
    return total === 1 ? "1 result found" : `${total} results found`;
  }

  const start = (state.currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(state.currentPage * PAGE_SIZE, total);

  return `Showing ${start}–${end} of ${total}`;
}

export function showUndoToast() {
  state.isUndoToastActive = true;
  document.body.classList.add("undo-active");
  let toast = document.getElementById("undo-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "undo-toast";
    toast.className = "toast-snackbar";
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-main">
        <span id="toast-message"></span>
      </div>
      <div class="toast-actions">
        <button id="undo-button">UNDO</button>
        <button id="close-toast-btn">✕</button>
      </div>
    </div>
    <div class="undo-progress-container">
      <div class="undo-progress-bar"></div>
    </div>
  `;

  document.getElementById("toast-message").textContent =
    `${state.pendingDeleteMap.size} item(s) deleted`;

  toast.classList.add("show");

  const undoBtn = document.getElementById("undo-button");
  const closeBtn = document.getElementById("close-toast-btn");

  undoBtn.onclick = async () => {
    state.isUndoToastActive = false;
    document.body.classList.remove("undo-active");
    clearTimeout(state.undoTimer);
    toast.classList.remove("show");

    state.pendingDeleteMap.forEach(({ element }) => {
      delete element.dataset.isPendingDelete;
      element.classList.remove("pending-delete");
    });

    state.pendingDeleteMap.clear();
    updateSavedEmptyState();
    await loadQuotaFromAPI(true);
  };

  closeBtn.onclick = finalizePendingDeletes;

  clearTimeout(state.undoTimer);
  state.undoTimer = setTimeout(finalizePendingDeletes, 5000);
}

export async function finalizePendingDeletes() {
  if (state.isFinalizingDeletes) return;
  state.isFinalizingDeletes = true;

  clearTimeout(state.undoTimer);
  const toast = document.getElementById("undo-toast");
  toast?.classList.remove("show");

  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) {
    state.isFinalizingDeletes = false;
    return;
  }

  while (state.pendingDeleteMap.size > 0) {
    const batch = Array.from(state.pendingDeleteMap.values());
    state.pendingDeleteMap.clear();

    for (const item of batch) {
      try {
        await item.finalize();
      } catch (err) {
        console.error("Delete failed:", err);
        if (item.element) {
          delete item.element.dataset.isPendingDelete;
          item.element.classList.remove("pending-delete");
        }
        showToast("Delete failed. Item restored.");
      }
    }
  }

  state.isFinalizingDeletes = false;
  state.isUndoToastActive = false;
  document.body.classList.remove("undo-active");
  await fetchAndRenderPage();
  updateFilterBanner();
  await loadQuotaFromAPI();
}

export async function toggleSearchMode(active) {
  if (state.isUndoToastActive) return;
  const searchContainer = document.getElementById("search-bar-container");
  const searchInput = document.getElementById("saved-search-input");
  const searchToggleButton = document.getElementById("search-toggle");
  const filterBtn = document.getElementById("filter-toggle");
  const exportBtn = document.getElementById("export-menu-toggle");
  const multiBtn = document.getElementById("multi-select-toggle");

  if (active) {
    searchContainer.classList.remove("hidden");

    searchToggleButton?.classList.add("hidden");

    filterBtn?.classList.add("hidden");
    exportBtn?.classList.add("hidden");
    multiBtn?.classList.add("hidden");
    searchInput.focus();
  } else {
    searchContainer.classList.add("hidden");

    searchToggleButton?.classList.remove("hidden");

    filterBtn?.classList.remove("hidden");
    exportBtn?.classList.remove("hidden");
    updateSavedEmptyState();

    searchInput.value = "";
    state.activeFilters.searchQuery = "";
    await fetchAndRenderPage();
    updateFilterBanner();
  }
}

export async function handleExport(format) {
  const data = await fetchSavedAnalysesData();
  if (format === "csv") {
    exportToCSV(data);
  } else {
    await exportToExcel(data);
  }
}

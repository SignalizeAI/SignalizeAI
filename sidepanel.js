import { analyzeWebsiteContent } from "./src/ai-analyze.js";

if (!window.supabase) {
  throw new Error('Supabase client not initialized. Make sure extension/supabase.bundle.js is loaded.');
}
const supabase = window.supabase;
let hasExtractedOnce = false;
let lastAnalysis = null;
let lastExtractedMeta = null;

const loginView = document.getElementById('login-view');
const welcomeView = document.getElementById('welcome-view');
const userNameSpan = document.getElementById('user-name');
const userEmailSpan = document.getElementById('user-email');
const userInitialSpan = document.getElementById('user-initial');
const signInBtn = document.getElementById('google-signin');
const signOutBtn = document.getElementById('sign-out');
const statusMsg = document.getElementById('status-msg');

async function signInWithGoogle() {
  try {
    statusMsg.textContent = "Logging in...";

    const redirectUrl = chrome.identity.getRedirectURL('supabase-auth');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true
      }
    });

    if (error) throw error;

    chrome.identity.launchWebAuthFlow(
      {
        url: data.url,
        interactive: true
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          statusMsg.textContent = "Login cancelled.";
          return;
        }

        if (!redirectUrl.includes('access_token')) {
          statusMsg.textContent = "Authentication failed.";
          return;
        }

        const url = new URL(redirectUrl);
        const params = new URLSearchParams(url.hash.substring(1));

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken) {
          statusMsg.textContent = "No access token received.";
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (sessionError) throw sessionError;
      }
    );

  } catch (err) {
    console.error("Login failed:", err);
    statusMsg.textContent = "Login failed. Please try again.";
  }
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign out error:", error);
}

function updateUI(session) {
  if (session) {
    loginView.classList.add('hidden');
    welcomeView.classList.remove('hidden');

    const user = session.user;
    const fullName = user.user_metadata.full_name || user.email;
    if (userNameSpan) userNameSpan.textContent = fullName;
    if (userEmailSpan) {
      userEmailSpan.textContent = user.email || 'user@signalize.ai';
    }
    if (userInitialSpan && fullName && fullName.length > 0) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    statusMsg.textContent = "";

    extractWebsiteContent();

  } else {
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
    hasExtractedOnce = false;
  }
}

async function extractWebsiteContent() {
  const contentCard = document.getElementById('website-content');
  const contentLoading = document.getElementById('content-loading');
  const contentError = document.getElementById('content-error');
  const contentData = document.getElementById('content-data');

  // Show loading state
  if (contentCard) contentCard.classList.remove('hidden');
  if (contentLoading) contentLoading.classList.remove('hidden');
  if (contentError) contentError.classList.add('hidden');
  if (contentData) contentData.classList.add('hidden');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab?.id || !tab.url) {
      if (contentLoading) contentLoading.classList.add('hidden');
      if (contentError) contentError.classList.remove('hidden');
      return;
    }

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("about:") ||
      tab.url.startsWith("edge://")
    ) {
      console.info("Skipping extraction on restricted page:", tab.url);
      if (contentLoading) contentLoading.classList.add('hidden');
      if (contentError) contentError.classList.remove('hidden');
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "EXTRACT_WEBSITE_CONTENT" },
      async (response) => {
        if (contentLoading) contentLoading.classList.add('hidden');

        if (chrome.runtime.lastError) {
          console.warn("Extractor not available on this page");
          if (contentError) contentError.classList.remove('hidden');
          return;
        }

        if (response?.ok && response.content) {
          console.log("📄 Extracted website content:", response.content);
          displayWebsiteContent(response.content);

          lastExtractedMeta = {
            title: response.content.title,
            url: response.content.url,
            domain: new URL(response.content.url).hostname
          };

          try {
            const aiCard = document.getElementById('ai-analysis');
            const aiLoading = document.getElementById('ai-loading');
            const aiData = document.getElementById('ai-data');

            if (aiCard) aiCard.classList.remove('hidden');
            if (aiLoading) aiLoading.classList.remove('hidden');
            if (aiData) aiData.classList.add('hidden');

            const analysis = await analyzeWebsiteContent(response.content);
            console.log("🧠 AI business analysis:", analysis);
            lastAnalysis = analysis;
            displayAIAnalysis(analysis);
          } catch (err) {
            console.error("AI analysis failed:", err);
          }

        } else {
          console.error("Extraction failed:", response?.error);
          if (contentError) contentError.classList.remove('hidden');
        }
      }
    );
  } catch (err) {
    console.error("Error extracting website content:", err);
    if (contentLoading) contentLoading.classList.add('hidden');
    if (contentError) contentError.classList.remove('hidden');
  }
}

function displayWebsiteContent(content) {
  const contentCard = document.getElementById('website-content');
  const contentData = document.getElementById('content-data');
  const contentError = document.getElementById('content-error');

  if (!contentCard || !contentData) return;

  // Hide error, show data
  if (contentError) contentError.classList.add('hidden');
  contentData.classList.remove('hidden');
  contentCard.classList.remove('hidden');

  // Display title
  const titleEl = document.getElementById('content-title-text');
  if (titleEl) {
    titleEl.textContent = content.title || 'No title available';
  }

  // Display meta description
  const metaDescEl = document.getElementById('content-meta-description');
  const metaDescSection = document.getElementById('meta-description-section');
  if (metaDescEl) {
    if (content.metaDescription) {
      metaDescEl.textContent = content.metaDescription;
      if (metaDescSection) metaDescSection.classList.remove('hidden');
    } else {
      if (metaDescSection) metaDescSection.classList.add('hidden');
    }
  }

  // Display headings
  const headingsEl = document.getElementById('content-headings');
  const headingsSection = document.getElementById('headings-section');
  if (headingsEl) {
    headingsEl.innerHTML = '';
    if (content.headings && content.headings.length > 0) {
      content.headings.forEach(heading => {
        const li = document.createElement('li');
        li.textContent = heading;
        headingsEl.appendChild(li);
      });
      if (headingsSection) headingsSection.classList.remove('hidden');
    } else {
      if (headingsSection) headingsSection.classList.add('hidden');
    }
  }

  // Display paragraphs
  const paragraphsEl = document.getElementById('content-paragraphs');
  const paragraphsSection = document.getElementById('paragraphs-section');
  if (paragraphsEl) {
    paragraphsEl.innerHTML = '';
    if (content.paragraphs && content.paragraphs.length > 0) {
      content.paragraphs.forEach(para => {
        const li = document.createElement('li');
        li.textContent = para;
        paragraphsEl.appendChild(li);
      });
      if (paragraphsSection) paragraphsSection.classList.remove('hidden');
    } else {
      if (paragraphsSection) paragraphsSection.classList.add('hidden');
    }
  }

  // Display URL
  const urlEl = document.getElementById('content-url');
  if (urlEl && content.url) {
    urlEl.href = content.url;
    urlEl.textContent = content.url;
  }
}

function displayAIAnalysis(analysis) {
  const aiCard = document.getElementById('ai-analysis');
  const aiLoading = document.getElementById('ai-loading');
  const aiData = document.getElementById('ai-data');

  if (aiCard) aiCard.classList.remove('hidden');
  if (aiLoading) aiLoading.classList.add('hidden');
  if (aiData) aiData.classList.remove('hidden');

  const whatEl = document.getElementById('ai-what-they-do');
  const targetEl = document.getElementById('ai-target-customer');
  const valueEl = document.getElementById('ai-value-prop');
  const salesEl = document.getElementById('ai-sales-angle');
  const scoreEl = document.getElementById('ai-sales-score');

  if (whatEl) whatEl.textContent = analysis.whatTheyDo || '—';
  if (targetEl) targetEl.textContent = analysis.targetCustomer || '—';
  if (valueEl) valueEl.textContent = analysis.valueProposition || '—';
  if (salesEl) salesEl.textContent = analysis.salesAngle || '—';
  if (scoreEl) scoreEl.textContent = analysis.salesReadinessScore ?? '—';
}

async function saveCurrentAnalysis() {
  if (!lastAnalysis || !lastExtractedMeta) return;

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  await supabase.from('saved_analyses').insert({
    user_id: user.id,
    domain: lastExtractedMeta.domain,
    url: lastExtractedMeta.url,
    title: lastExtractedMeta.title,
    what_they_do: lastAnalysis.whatTheyDo,
    target_customer: lastAnalysis.targetCustomer,
    value_proposition: lastAnalysis.valueProposition,
    sales_angle: lastAnalysis.salesAngle,
    sales_readiness_score: lastAnalysis.salesReadinessScore
  });
}

if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
if (signOutBtn) signOutBtn.addEventListener('click', signOut);

const dropdownHeader = document.getElementById('dropdown-header');
const dropdownCard = document.querySelector('.dropdown-card');
const dropdownContent = document.getElementById('dropdown-content');

if (dropdownHeader && dropdownCard) {
  dropdownHeader.addEventListener('click', () => {
    dropdownCard.classList.toggle('expanded');
  });
}

// Listen for tab change messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TAB_CHANGED") {
    // Check if user is logged in and welcome view is visible
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && welcomeView && !welcomeView.classList.contains('hidden')) {
        // Small delay to ensure content script is ready
        setTimeout(() => {
          extractWebsiteContent();
        }, 300);
      }
    });
  }
});

// Also listen for visibility changes (when sidepanel becomes visible)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && welcomeView && !welcomeView.classList.contains('hidden')) {
        setTimeout(() => {
          extractWebsiteContent();
        }, 300);
      }
    });
  }
});

document
  .getElementById('save-analysis')
  ?.addEventListener('click', saveCurrentAnalysis);

supabase.auth.onAuthStateChange((event, session) => {
  updateUI(session);
});

supabase.auth.getSession().then(({ data }) => {
  updateUI(data.session);
});

const button = document.getElementById("saveButton");

button.addEventListener("click", () => {
  button.classList.toggle("active");
});

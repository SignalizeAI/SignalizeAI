import { analyzeWebsiteContent } from "./src/ai-analyze.js";

if (!window.supabase) {
  throw new Error('Supabase client not initialized. Make sure extension/supabase.bundle.js is loaded.');
}
const supabase = window.supabase;
let hasExtractedOnce = false;

const loginView = document.getElementById('login-view');
const welcomeView = document.getElementById('welcome-view');
const userNameSpan = document.getElementById('user-name');
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
    if (userInitialSpan && fullName && fullName.length > 0) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    statusMsg.textContent = "";

    if (!hasExtractedOnce) {
      hasExtractedOnce = true;
      extractWebsiteContent();
    }

  } else {
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
    hasExtractedOnce = false;
  }
}

async function extractWebsiteContent() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab?.id || !tab.url) return;

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("about:") ||
      tab.url.startsWith("edge://")
    ) {
      console.info("Skipping extraction on restricted page:", tab.url);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "EXTRACT_WEBSITE_CONTENT" },
      async (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Extractor not available on this page");
          return;
        }

        if (response?.ok) {
          console.log("📄 Extracted website content:", response.content);

          try {
            const analysis = await analyzeWebsiteContent(response.content);
            console.log("🧠 AI business analysis:", analysis);
          } catch (err) {
            console.error("AI analysis failed:", err);
          }

        } else {
          console.error("Extraction failed:", response?.error);
        }
      }
    );
  } catch (err) {
    console.error("Error extracting website content:", err);
  }
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

supabase.auth.onAuthStateChange((event, session) => {
  updateUI(session);
});

supabase.auth.getSession().then(({ data }) => {
  updateUI(data.session);
});
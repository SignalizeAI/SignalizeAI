// ------------------------------------------------------------------
// 1. Initialization
// ------------------------------------------------------------------

// Since we are using the downloaded UMD script, the 'supabase' object 
// is attached to the global 'window' object.
// We access the 'createClient' function from it.
const { createClient } = window.supabase;

const SUPABASE_URL = "https://qcvnfvbzxbnrquxtjihp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjdm5mdmJ6eGJucnF1eHRqaWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzOTg0NzUsImV4cCI6MjA4MTk3NDQ3NX0.0MWdwZfa_dJVioyOmCMRNWE0ZQra8-GUkAY9XP7jCEA";

// Create the client instance
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------------
// 2. DOM Elements
// ------------------------------------------------------------------
const loginView = document.getElementById('login-view');
const welcomeView = document.getElementById('welcome-view');
const userNameSpan = document.getElementById('user-name');
const signInBtn = document.getElementById('google-signin');
const signOutBtn = document.getElementById('sign-out');
const statusMsg = document.getElementById('status-msg');

// ------------------------------------------------------------------
// 3. Main Auth Logic (The "Auth Dance")
// ------------------------------------------------------------------
async function signInWithGoogle() {
  try {
    statusMsg.textContent = "Initializing login...";

    // Step A: Ask Supabase for the Google Login URL.
    // We set 'skipBrowserRedirect: true' because we don't want Supabase 
    // to navigate the current window (which is a side panel). 
    // We want the URL so we can open it in a popup.
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: chrome.identity.getRedirectURL(),
        skipBrowserRedirect: true 
      }
    });

    if (error) throw error;

    // Step B: Launch Chrome's native auth popup using the URL we got above.
    chrome.identity.launchWebAuthFlow(
      {
        url: data.url, 
        interactive: true
      },
      async (redirectUrl) => {
        // Check for internal Chrome errors (e.g., user closed the popup)
        if (chrome.runtime.lastError) {
          statusMsg.textContent = "Login cancelled.";
          console.error(chrome.runtime.lastError);
          return;
        }

        // Step C: Handle the successful return URL
        if (redirectUrl) {
          // The URL comes back with tokens in the hash, e.g.:
          // https://<id>.chromiumapp.org/#access_token=...&refresh_token=...
          const urlObj = new URL(redirectUrl);
          const params = new URLSearchParams(urlObj.hash.substring(1)); // Remove the '#'
          
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (!accessToken) {
            statusMsg.textContent = "No access token found in response.";
            return;
          }

          // Step D: Feed the tokens back into our local Supabase client
          const { error: sessionError } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (sessionError) throw sessionError;
          
          // Success! The onAuthStateChange listener below will handle the UI update.
          statusMsg.textContent = "Login successful!";
        }
      }
    );
  } catch (err) {
    console.error("Login Error:", err);
    statusMsg.textContent = "Error: " + err.message;
  }
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error("Sign out error:", error);
  }
}

// ------------------------------------------------------------------
// 4. UI State Management
// ------------------------------------------------------------------
function updateUI(session) {
  if (session) {
    // User is logged in
    loginView.classList.add('hidden');
    welcomeView.classList.remove('hidden');
    
    // Try to get the full name, fallback to email if name is missing
    const name = session.user.user_metadata.full_name || session.user.email;
    userNameSpan.textContent = name;
    statusMsg.textContent = ""; // Clear any old error messages
  } else {
    // User is logged out
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
  }
}

// ------------------------------------------------------------------
// 5. Event Listeners & Initial Check
// ------------------------------------------------------------------

// Listen for clicks
signInBtn.addEventListener('click', signInWithGoogle);
signOutBtn.addEventListener('click', signOut);

// Listen for any auth changes (login, logout, token refresh)
supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log("Auth Event:", event);
  updateUI(session);
});

// Check if user is already logged in when the side panel opens
supabaseClient.auth.getSession().then(({ data }) => {
  updateUI(data.session);
});
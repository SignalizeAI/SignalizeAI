const authSection = document.getElementById("authSection");
const userSection = document.getElementById("userSection");
const userEmailEl = document.getElementById("userEmail");
const websiteEl = document.getElementById("website");

/* ---------------- WAIT FOR SUPABASE ---------------- */

function waitForSupabase() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.supabase && window.supabase.auth) resolve();
      else setTimeout(check, 10);
    };
    check();
  });
}

/* ---------------- UI HELPERS ---------------- */

function showAuth() {
  authSection.classList.remove("hidden");
  userSection.classList.add("hidden");
}

function showUser(user) {
  userEmailEl.textContent = user.email;
  authSection.classList.add("hidden");
  userSection.classList.remove("hidden");
}

/* ---------------- GOOGLE LOGIN ---------------- */

document.getElementById("googleLogin").addEventListener("click", async () => {
  chrome.runtime.sendMessage({ type: "LOGIN_GOOGLE" }, () => {
    // ignore lastError if any
    void chrome.runtime.lastError;
  });
});

/* ---------------- EMAIL OTP LOGIN ---------------- */

document.getElementById("emailLogin").addEventListener("click", async () => {
  await waitForSupabase();

  const email = prompt("Enter your email");
  if (!email) return;

  // Ask background for the correct redirect URL (chrome.identity is available there)
  const redirectUrl = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_REDIRECT_URL" }, (resp) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(resp?.redirectUrl || null);
    });
  });

  if (!redirectUrl) {
    console.error("Could not get redirect URL from background.");
    alert("Login failed (redirect URL unavailable).");
    return;
  }

  const { error } = await window.supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) {
    console.error("Email login error:", error.message);
    return;
  }

  alert("Check your email for the login link.");
});

/* ---------------- LOGOUT ---------------- */

document.getElementById("logout").addEventListener("click", async () => {
  await waitForSupabase();
  await window.supabase.auth.signOut();
  showAuth();
});

/* ---------------- SESSION LOAD ---------------- */

async function loadSession() {
  const { data } = await window.supabase.auth.getUser();
  if (data?.user) showUser(data.user);
  else showAuth();
}

/* ---------------- TAB CHANGE LISTENER ---------------- */

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TAB_CHANGED") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) websiteEl.textContent = tabs[0].url || "Unknown";
    });
  }
});

/* ---------------- INITIAL LOAD ---------------- */

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) websiteEl.textContent = tabs[0].url || "Unknown";
});

/* ---------------- INIT (SUPABASE SAFE) ---------------- */

(async () => {
  await waitForSupabase();

  window.supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) showUser(session.user);
    if (event === "SIGNED_OUT") showAuth();
  });

  await loadSession();
})();

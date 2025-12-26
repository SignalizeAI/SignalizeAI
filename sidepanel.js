document.addEventListener("DOMContentLoaded", () => {
  const authSection = document.getElementById("authSection");
  const userSection = document.getElementById("userSection");

  const userEmailEl = document.getElementById("userEmail");
  const websiteEl = document.getElementById("website");

  /* ---------- WAIT FOR SUPABASE ---------- */
  function waitForSupabase() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.supabase?.auth) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
  }

  /* ---------- UI HELPERS ---------- */
  function showAuth() {
    authSection.classList.remove("hidden");
    userSection.classList.add("hidden");
  }

  function showUser(user) {
    userEmailEl.textContent = user.email;
    authSection.classList.add("hidden");
    userSection.classList.remove("hidden");
  }

  /* ---------- GOOGLE LOGIN ---------- */
  document.getElementById("googleLogin").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "LOGIN_GOOGLE" }, () => {
      void chrome.runtime.lastError;
    });
  });

  /* ---------- LOGOUT ---------- */
  document.getElementById("logout").addEventListener("click", async () => {
    await waitForSupabase();
    await window.supabase.auth.signOut({ scope: "global" });
    showAuth();
  });

  /* ---------- SESSION ---------- */
  async function loadSession() {
    const { data } = await window.supabase.auth.getUser();
    data?.user ? showUser(data.user) : showAuth();
  }

  /* ---------- TAB LISTENER ---------- */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TAB_CHANGED") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) websiteEl.textContent = tabs[0].url || "Unknown";
      });
    }
  });

  /* ---------- INITIAL LOAD ---------- */
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) websiteEl.textContent = tabs[0].url || "Unknown";
  });

  /* ---------- INIT ---------- */
  (async () => {
    await waitForSupabase();

    window.supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) showUser(session.user);
      if (event === "SIGNED_OUT") showAuth();
    });

    await loadSession();
  })();
});

const loadScript = (src) => new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = src;
  script.onload = resolve;
  script.onerror = () => reject(new Error(`Failed to load ${src}`));
  document.body.appendChild(script);
});

const loadPartials = async () => {
  let nodes = Array.from(document.querySelectorAll("[data-include]"));
  while (nodes.length > 0) {
    for (const node of nodes) {
      const partialPath = node.getAttribute("data-include");
      try {
        const response = await fetch(partialPath);
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        node.outerHTML = await response.text();
      } catch (error) {
        console.error(`Failed to load ${partialPath}`, error);
      }
    }
    nodes = Array.from(document.querySelectorAll("[data-include]"));
  }
};

const boot = async () => {
  await loadPartials();
  await loadScript("extension/supabase.bundle.js");
  await import("./extension/sidepanel.js");
};

boot();

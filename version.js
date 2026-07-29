const VERSION_CURRENT_KEY = "np-track.current-version";
const VERSION_RELOADED_KEY = "np-track.reloaded-version";
const VERSION_CHECK_INTERVAL_MS = 60_000;
const VERSION_URL = new URL("./version.json", document.currentScript.src);
let versionCheckRunning = false;

async function fetchVersion() {
  try {
    VERSION_URL.searchParams.set("ts", String(Date.now()));
    const response = await fetch(VERSION_URL, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function checkForUpdate() {
  if (versionCheckRunning) return;
  versionCheckRunning = true;
  const next = await fetchVersion();
  versionCheckRunning = false;
  if (!next?.version) return;

  const current = localStorage.getItem(VERSION_CURRENT_KEY);
  if (!current) {
    localStorage.setItem(VERSION_CURRENT_KEY, next.version);
    return;
  }
  if (current === next.version) {
    sessionStorage.removeItem(VERSION_RELOADED_KEY);
    return;
  }
  if (sessionStorage.getItem(VERSION_RELOADED_KEY) === next.version) {
    localStorage.setItem(VERSION_CURRENT_KEY, next.version);
    return;
  }

  sessionStorage.setItem(VERSION_RELOADED_KEY, next.version);
  localStorage.setItem(VERSION_CURRENT_KEY, next.version);
  location.reload();
}

void checkForUpdate();
setInterval(() => void checkForUpdate(), VERSION_CHECK_INTERVAL_MS);
addEventListener("focus", () => void checkForUpdate());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkForUpdate();
});

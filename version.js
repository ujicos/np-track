const VERSION_CURRENT_KEY = "np-track.current-version";
const VERSION_RELOADED_KEY = "np-track.reloaded-version";
const VERSION_CHECK_INTERVAL_MS = 60_000;
const VERSION_URL = new URL("./version.json", document.currentScript.src);
const SERVICE_WORKER_URL = new URL("./service-worker.js", document.currentScript.src);
let versionCheckRunning = false;
let controllerRefreshRunning = false;

if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    void registerLatestServiceWorker();
  });
}

async function registerLatestServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_URL.href,
      { updateViaCache: "none" },
    );
    await registration.update();
    return registration;
  } catch {
    return null;
  }
}

function waitForWorkerState(worker, targetState, timeoutMs = 4_000) {
  if (!worker || worker.state === targetState) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    worker.addEventListener("statechange", () => {
      if (worker.state !== targetState) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function activateLatestServiceWorker() {
  if (!("serviceWorker" in navigator) || controllerRefreshRunning) return;
  controllerRefreshRunning = true;
  try {
    const registration = await registerLatestServiceWorker();
    const installing = registration?.installing;
    if (installing) await waitForWorkerState(installing, "installed");
    const waiting = registration?.waiting;
    if (!waiting) return;

    const controllerChanged = new Promise((resolve) => {
      const timeout = setTimeout(resolve, 4_000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
    waiting.postMessage({ type: "SKIP_WAITING" });
    await controllerChanged;
  } finally {
    controllerRefreshRunning = false;
  }
}

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
  await activateLatestServiceWorker();
  location.reload();
}

void checkForUpdate();
setInterval(() => void checkForUpdate(), VERSION_CHECK_INTERVAL_MS);
addEventListener("focus", () => void checkForUpdate());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkForUpdate();
});

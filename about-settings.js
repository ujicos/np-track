import { clearOfflineCache } from "./offline-cache.js";

const SETTINGS_KEY = "np-track.settings";
const ids = [
  "default-psn",
  "legacy-psn",
  "auto-load-default",
  "show-legacy-id",
  "show-trophy-games",
  "top-games-on-top",
  "trophy-original-order",
  "hide-share-factory",
  "ps-colors",
];
const elements = Object.fromEntries(
  ids.map((id) => [
    id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    document.querySelector(`#${id}`),
  ]),
);
const dialog = document.querySelector("#settings-dialog");
const form = document.querySelector("#settings-form");
const message = document.querySelector("#settings-message");
const clearButton = document.querySelector("#clear-local-cache");

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      defaultPsn: typeof saved.defaultPsn === "string" ? saved.defaultPsn : "",
      legacyPsn: typeof saved.legacyPsn === "string" ? saved.legacyPsn : "",
      autoLoad: Boolean(saved.autoLoad),
      showLegacyId: Boolean(saved.showLegacyId),
      showTrophyGames: Boolean(saved.showTrophyGames),
      topGamesOnTop: Boolean(saved.topGamesOnTop),
      trophyOriginalOrder: Boolean(saved.trophyOriginalOrder),
      hideShareFactory:
        typeof saved.hideShareFactory === "boolean"
          ? saved.hideShareFactory
          : true,
      psColors:
        typeof saved.psColors === "boolean"
          ? saved.psColors
          : typeof saved.steamTheme === "boolean"
            ? !saved.steamTheme
            : false,
    };
  } catch {
    return {
      defaultPsn: "",
      legacyPsn: "",
      autoLoad: false,
      showLegacyId: false,
      showTrophyGames: false,
      topGamesOnTop: false,
      trophyOriginalOrder: false,
      hideShareFactory: true,
      psColors: false,
    };
  }
}

function applyTheme(psColors) {
  document.documentElement.dataset.theme = psColors ? "playstation" : "steam";
}

function fillForm(settings) {
  elements.defaultPsn.value = settings.defaultPsn;
  elements.legacyPsn.value = settings.legacyPsn;
  elements.autoLoadDefault.checked = settings.autoLoad;
  elements.showLegacyId.checked = settings.showLegacyId;
  elements.showTrophyGames.checked = settings.showTrophyGames;
  elements.topGamesOnTop.checked = settings.topGamesOnTop;
  elements.trophyOriginalOrder.checked = settings.trophyOriginalOrder;
  elements.hideShareFactory.checked = settings.hideShareFactory;
  elements.psColors.checked = settings.psColors;
  message.textContent = "";
}

applyTheme(readSettings().psColors);

document.querySelector("#open-settings").addEventListener("click", () => {
  fillForm(readSettings());
  dialog.showModal();
});
document.querySelector("#close-settings").addEventListener("click", () => {
  dialog.close();
});
document.querySelector("#cancel-settings").addEventListener("click", () => {
  dialog.close();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

clearButton.addEventListener("click", async () => {
  clearButton.disabled = true;
  message.className = "mt-3 min-h-5 text-xs text-slate-500";
  message.textContent = "Clearing offline cache …";
  try {
    await clearOfflineCache();
    message.textContent =
      "Saved profiles and downloaded game icons were cleared.";
  } catch {
    message.className = "mt-3 min-h-5 text-xs text-rose-400";
    message.textContent = "The offline cache could not be cleared.";
  } finally {
    clearButton.disabled = false;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const defaultPsn = elements.defaultPsn.value.trim();
  const legacyPsn = elements.legacyPsn.value.trim();
  if (
    (defaultPsn && !/^[A-Za-z0-9_-]{3,16}$/.test(defaultPsn)) ||
    (legacyPsn && !/^[A-Za-z0-9_-]{3,16}$/.test(legacyPsn))
  ) {
    message.className = "mt-3 min-h-5 text-xs text-rose-400";
    message.textContent = "Enter valid PSN online IDs.";
    return;
  }

  const settings = {
    defaultPsn,
    legacyPsn,
    autoLoad: Boolean(defaultPsn && elements.autoLoadDefault.checked),
    showLegacyId: Boolean(legacyPsn && elements.showLegacyId.checked),
    showTrophyGames: elements.showTrophyGames.checked,
    topGamesOnTop: elements.topGamesOnTop.checked,
    trophyOriginalOrder: elements.trophyOriginalOrder.checked,
    hideShareFactory: elements.hideShareFactory.checked,
    psColors: elements.psColors.checked,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyTheme(settings.psColors);
  dialog.close();
});

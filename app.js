import { formatDuration, normaliseNpssoInput } from "./utils.js";
import {
  cacheGameIcons,
  clearOfflineCache,
  getProfileSnapshot,
  saveProfileSnapshot,
} from "./offline-cache.js";

const API_BASE_URL = "https://np-track-api.ujicos.workers.dev";
const PAGE_SIZE = 24;
const SETTINGS_KEY = "np-track.settings";
const PROFILE_REFRESH_INTERVAL_MS = 60_000;
const LIVE_TIME_INTERVAL_MS = 5_000;

const state = {
  primary: null,
  comparison: null,
  games: [],
  visible: PAGE_SIZE,
  query: "",
  sort: "hours",
  sessionNpsso: "",
  trophyEarnedOnly: false,
  activeTrophyData: null,
  refreshRunning: false,
  livePlaytimeBase: 0,
  livePlaytimeStartedAt: 0,
};

const elements = {
  form: document.querySelector("#player-form"),
  input: document.querySelector("#psn-id"),
  message: document.querySelector("#message"),
  useNpsso: document.querySelector("#use-npsso"),
  toggleNpsso: document.querySelector("#toggle-npsso"),
  npssoFields: document.querySelector("#npsso-fields"),
  npssoSecret: document.querySelector("#npsso-secret"),
  results: document.querySelector("#results"),
  avatar: document.querySelector("#avatar"),
  onlineId: document.querySelector("#online-id"),
  plusBadge: document.querySelector("#plus-badge"),
  legacyIdLabel: document.querySelector("#legacy-id-label"),
  statusDot: document.querySelector("#status-dot"),
  presenceLabel: document.querySelector("#presence-label"),
  presenceNote: document.querySelector("#presence-note"),
  currentGame: document.querySelector("#current-game"),
  stats: document.querySelector("#stats"),
  comparison: document.querySelector("#comparison"),
  comparisonCards: document.querySelector("#comparison-cards"),
  comparisonNote: document.querySelector("#comparison-note"),
  clearComparison: document.querySelector("#clear-comparison"),
  topGamesSection: document.querySelector("#top-games-section"),
  topGames: document.querySelector("#top-games"),
  gamesSection: document.querySelector("#games-section"),
  gameSearch: document.querySelector("#game-search"),
  gameSort: document.querySelector("#game-sort"),
  gameCount: document.querySelector("#game-count"),
  games: document.querySelector("#games"),
  showMore: document.querySelector("#show-more"),
  openSettings: document.querySelector("#open-settings"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  closeSettings: document.querySelector("#close-settings"),
  cancelSettings: document.querySelector("#cancel-settings"),
  defaultPsn: document.querySelector("#default-psn"),
  legacyPsn: document.querySelector("#legacy-psn"),
  autoLoadDefault: document.querySelector("#auto-load-default"),
  showLegacyId: document.querySelector("#show-legacy-id"),
  showTrophyGames: document.querySelector("#show-trophy-games"),
  topGamesOnTop: document.querySelector("#top-games-on-top"),
  psColors: document.querySelector("#ps-colors"),
  clearLocalCache: document.querySelector("#clear-local-cache"),
  settingsMessage: document.querySelector("#settings-message"),
  trophyDialog: document.querySelector("#trophy-dialog"),
  trophyBack: document.querySelector("#trophy-back"),
  closeTrophies: document.querySelector("#close-trophies"),
  trophyTitle: document.querySelector("#trophy-dialog-title"),
  trophySubtitle: document.querySelector("#trophy-dialog-subtitle"),
  trophyStatus: document.querySelector("#trophy-status"),
  trophyContent: document.querySelector("#trophy-content"),
  earnedOnlyWrap: document.querySelector("#earned-only-wrap"),
  earnedOnly: document.querySelector("#earned-only"),
};

const initialSettings = readSettings();
applyTheme(initialSettings.psColors);
positionTopGames(initialSettings);

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestedId = elements.input.value.trim();
  const mode =
    state.primary &&
    state.primary.player.onlineId.toLowerCase() !== requestedId.toLowerCase()
      ? "comparison"
      : "primary";
  await loadPlayer(requestedId, mode);
});

elements.toggleNpsso.addEventListener("click", () => {
  const enabled = !elements.useNpsso.checked;
  elements.useNpsso.checked = enabled;
  elements.npssoFields.classList.toggle("hidden", !enabled);
  elements.npssoSecret.required = enabled;
  elements.toggleNpsso.setAttribute("aria-expanded", String(enabled));
  elements.toggleNpsso.textContent = enabled ? "⌃" : "⌄";
  elements.toggleNpsso.setAttribute(
    "aria-label",
    `${enabled ? "Close" : "Open"} temporary NPSSO override`,
  );
  if (enabled) elements.npssoSecret.focus();
  if (!enabled) elements.npssoSecret.value = "";
});

elements.gameSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLocaleLowerCase("en");
  state.visible = PAGE_SIZE;
  renderGames();
});

elements.gameSort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  state.visible = PAGE_SIZE;
  renderGames();
});

elements.showMore.addEventListener("click", () => {
  state.visible += PAGE_SIZE;
  renderGames();
});

elements.clearComparison.addEventListener("click", () => {
  state.comparison = null;
  renderComparison();
  updateUrl();
});

elements.openSettings.addEventListener("click", () => {
  const settings = readSettings();
  elements.defaultPsn.value = settings.defaultPsn;
  elements.legacyPsn.value = settings.legacyPsn;
  elements.autoLoadDefault.checked = settings.autoLoad;
  elements.showLegacyId.checked = settings.showLegacyId;
  elements.showTrophyGames.checked = settings.showTrophyGames;
  elements.topGamesOnTop.checked = settings.topGamesOnTop;
  elements.psColors.checked = settings.psColors;
  elements.settingsMessage.textContent = "";
  elements.settingsDialog.showModal();
});

elements.closeSettings.addEventListener("click", () => {
  elements.settingsDialog.close();
});

elements.cancelSettings.addEventListener("click", () => {
  elements.settingsDialog.close();
});

elements.settingsDialog.addEventListener("click", (event) => {
  if (event.target === elements.settingsDialog) elements.settingsDialog.close();
});

elements.clearLocalCache.addEventListener("click", async () => {
  elements.clearLocalCache.disabled = true;
  elements.settingsMessage.className = "mt-3 min-h-5 text-xs text-slate-500";
  elements.settingsMessage.textContent = "Clearing offline cache …";
  try {
    await clearOfflineCache();
    elements.settingsMessage.textContent =
      "Saved profiles and downloaded game icons were cleared.";
  } catch {
    elements.settingsMessage.className = "mt-3 min-h-5 text-xs text-rose-400";
    elements.settingsMessage.textContent = "The offline cache could not be cleared.";
  } finally {
    elements.clearLocalCache.disabled = false;
  }
});

elements.closeTrophies.addEventListener("click", () => {
  elements.trophyDialog.close();
});

elements.trophyBack.addEventListener("click", () => {
  renderTrophyOverview();
});

elements.earnedOnly.addEventListener("change", () => {
  state.trophyEarnedOnly = elements.earnedOnly.checked;
  if (state.activeTrophyData) renderTrophyDetails(state.activeTrophyData);
});

elements.trophyDialog.addEventListener("click", (event) => {
  if (event.target === elements.trophyDialog) elements.trophyDialog.close();
});

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const defaultPsn = elements.defaultPsn.value.trim();
  const legacyPsn = elements.legacyPsn.value.trim();
  if (defaultPsn && !/^[A-Za-z0-9_-]{3,16}$/.test(defaultPsn)) {
    elements.settingsMessage.textContent = "Enter a valid PSN online ID.";
    elements.settingsMessage.className = "mt-3 min-h-5 text-xs text-rose-400";
    return;
  }
  if (legacyPsn && !/^[A-Za-z0-9_-]{3,16}$/.test(legacyPsn)) {
    elements.settingsMessage.textContent = "Enter a valid previous PSN online ID.";
    elements.settingsMessage.className = "mt-3 min-h-5 text-xs text-rose-400";
    return;
  }

  const settings = {
    defaultPsn,
    legacyPsn,
    autoLoad: Boolean(defaultPsn && elements.autoLoadDefault.checked),
    showLegacyId: Boolean(legacyPsn && elements.showLegacyId.checked),
    showTrophyGames: elements.showTrophyGames.checked,
    topGamesOnTop: elements.topGamesOnTop.checked,
    psColors: elements.psColors.checked,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyTheme(settings.psColors);
  positionTopGames(settings);
  elements.settingsDialog.close();
  if (state.primary) {
    renderProfile(state.primary);
    renderStats(state.primary);
  }

  if (
    settings.autoLoad &&
    state.primary?.player.onlineId.toLowerCase() !== defaultPsn.toLowerCase()
  ) {
    elements.input.value = defaultPsn;
    await loadPlayer(defaultPsn, "primary");
  }
});

async function loadPlayer(onlineId, mode = "primary") {
  const npssoOverride = elements.useNpsso.checked
    ? normaliseNpssoInput(elements.npssoSecret.value)
    : "";
  if (elements.useNpsso.checked && !npssoOverride) {
    setMessage("Paste an NPSSO value or turn off the temporary override.", true);
    elements.npssoSecret.focus();
    return;
  }

  setLoading(true, mode === "comparison" ? "Loading comparison …" : "Loading profile …");
  if (mode === "primary") elements.results.classList.add("hidden");

  try {
    const settings = readSettings();
    const legacyOnlineId =
      settings.defaultPsn.toLowerCase() === onlineId.toLowerCase()
        ? settings.legacyPsn
        : "";
    const data = await fetchPlayerWithOffline(
      onlineId,
      npssoOverride,
      legacyOnlineId,
    );
    if (mode === "comparison") {
      state.comparison = data;
      renderComparison();
    } else {
      applyPrimaryProfile(data, { resetView: true });
    }

    const cacheMessage =
      data.meta.localOffline
        ? `Offline snapshot from ${formatDate(data.meta.localSavedAt)}.\nIt will update automatically when the connection returns.`
        : data.meta.cache === "BYPASS"
          ? `Updated ${formatDate(data.meta.fetchedAt)} with the temporary override.\nSaved only on this device for offline use.`
        : data.meta.cache === "HIT"
          ? `Showing a cached snapshot from ${formatDate(data.meta.fetchedAt)}.`
          : `Updated ${formatDate(data.meta.fetchedAt)}.`;
    setMessage(cacheMessage);
    if (npssoOverride) {
      state.sessionNpsso = npssoOverride;
      elements.npssoSecret.value = "";
      elements.npssoSecret.required = false;
      elements.useNpsso.checked = false;
      elements.npssoFields.classList.add("hidden");
      elements.toggleNpsso.textContent = "⌄";
      elements.toggleNpsso.setAttribute("aria-expanded", "false");
      elements.toggleNpsso.setAttribute(
        "aria-label",
        "Open temporary NPSSO override",
      );
    }
    updateUrl();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function fetchPlayer(onlineId, npssoOverride, legacyOnlineId = "") {
  const headers = {};
  if (npssoOverride) headers["X-NPSSO-Override"] = npssoOverride;
  if (legacyOnlineId) headers["X-PSN-Legacy-ID"] = legacyOnlineId;
  let response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/player/${encodeURIComponent(onlineId)}`,
      { headers },
    );
  } catch {
    const error = new Error("The network is unavailable.");
    error.isNetworkError = true;
    throw error;
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load this profile.");
  return data;
}

async function fetchPlayerWithOffline(
  onlineId,
  npssoOverride,
  legacyOnlineId = "",
) {
  try {
    const data = await fetchPlayer(onlineId, npssoOverride, legacyOnlineId);
    try {
      await saveProfileSnapshot(data);
    } catch {
      // A storage quota or private-browsing restriction must not block results.
    }
    void cacheProfileImages(data);
    return data;
  } catch (error) {
    if (!error.isNetworkError) throw error;
    let snapshot = null;
    try {
      snapshot = await getProfileSnapshot(onlineId);
    } catch {
      // Keep the original network error when local storage is unavailable.
    }
    if (!snapshot?.data) throw error;
    return {
      ...snapshot.data,
      meta: {
        ...snapshot.data.meta,
        cache: "LOCAL",
        localOffline: true,
        localSavedAt: snapshot.savedAt,
      },
    };
  }
}

function applyPrimaryProfile(data, { resetView = false } = {}) {
  state.primary = data;
  if (resetView) {
    state.comparison = null;
    state.visible = PAGE_SIZE;
    state.query = "";
    elements.gameSearch.value = "";
  }
  state.games = data.games || [];
  setLivePlaytimeBaseline(data);
  renderProfile(data);
  renderStats(data);
  renderTopGames();
  renderGames();
  renderComparison();
  positionTopGames();
  elements.results.classList.remove("hidden");
}

function cacheProfileImages(data) {
  const urls = [
    data.player?.avatarUrl,
    ...(data.games || []).map((game) => game.imageUrl),
    ...(data.presence?.currentGames || []).map((game) => game.iconUrl),
    ...(data.trophyTitles || []).map((title) => title.iconUrl),
  ];
  return cacheGameIcons(urls).catch(() => {});
}

function renderProfile(data) {
  const { player, presence } = data;
  elements.avatar.src = player.avatarUrl || avatarFallback(player.onlineId);
  elements.avatar.alt = `Profile picture for ${player.onlineId}`;
  elements.onlineId.textContent = player.onlineId;
  elements.plusBadge.classList.toggle("hidden", !player.isPlus);
  const settings = readSettings();
  const showLegacy =
    settings.showLegacyId &&
    settings.legacyPsn &&
    settings.defaultPsn.toLowerCase() === player.onlineId.toLowerCase();
  elements.legacyIdLabel.textContent = showLegacy
    ? `Previous PSN ID: ${settings.legacyPsn}`
    : "";
  elements.legacyIdLabel.classList.toggle("hidden", !showLegacy);

  if (presence.status === "playing" || presence.status === "online") {
    elements.presenceLabel.replaceChildren(
      document.createTextNode(
        presence.status === "playing" ? "Playing now on " : "Online on ",
      ),
      platformBadge(presence.platform),
    );
  } else {
    elements.presenceLabel.textContent =
      presence.status === "offline" ? "Offline" : "Status unavailable or hidden";
  }
  elements.presenceNote.textContent = presence.note || "";
  elements.statusDot.className = `h-2.5 w-2.5 rounded-full ${
    presence.online ? "bg-emerald-400 shadow-[0_0_12px_#34d399]" : "bg-slate-500"
  }`;

  const game = presence.currentGames?.[0];
  elements.currentGame.classList.toggle("hidden", !game);
  if (game) {
    const image = document.createElement("img");
    image.className =
      "game-icon game-cover-glow h-14 w-14 shrink-0 rounded-xl";
    image.src = game.iconUrl || avatarFallback(game.name);
    image.alt = "";
    const body = node("div", "min-w-0 flex-1");
    const playingOn = node(
      "div",
      "flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400",
    );
    playingOn.append(
      document.createTextNode("Playing now on"),
      platformBadge(game.platform),
    );
    body.append(
      playingOn,
      node("p", "mt-0.5 truncate font-bold", game.name),
    );
    const row = node("div", "flex min-w-0 items-center gap-3");
    row.append(image, body);
    elements.currentGame.replaceChildren(row);
  }
}

function renderStats(data) {
  const { stats } = data;
  const trophyTotal = getTrophyTotal(stats);
  const cards = [
    {
      label: "Total playtime",
      value: formatDuration(currentLivePlaytime()),
      detail: state.livePlaytimeStartedAt
        ? "Estimated live while playing"
        : "",
      livePlaytime: true,
    },
    {
      label: "Games played",
      value: formatNumber(stats.totalGames),
      detail: "Visible game history",
    },
  ];
  if (readSettings().showTrophyGames) {
    cards.push({
      label: "Trophy games",
      value: formatNumber(stats.trophyGames),
      detail: "Games with trophy sets",
    });
  }
  cards.push({
    label: "Trophies",
    value: trophyTotal === null ? "Hidden" : formatNumber(trophyTotal),
    detail: "View trophy collection",
    action: openTrophyOverview,
  });

  elements.stats.replaceChildren(
    ...cards.map(({ label, value, detail, action, livePlaytime }) => {
      const card = node(
        action ? "button" : "article",
        `glass rounded-2xl border border-white/10 p-5 text-left ${
          action ? "transition hover:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/50" : ""
        }`,
      );
      if (action) {
        card.type = "button";
        card.addEventListener("click", action);
      }
      const valueNode = node(
        "p",
        "mt-2 text-2xl font-black tabular-nums",
        value,
      );
      if (livePlaytime) valueNode.dataset.livePlaytime = "true";
      card.append(node("p", "text-sm text-slate-400", label), valueNode);
      if (detail) {
        card.append(node("p", "mt-1 text-xs text-slate-600", detail));
      }
      return card;
    }),
  );
}

function renderComparison() {
  const primary = state.primary;
  const comparison = state.comparison;
  elements.comparison.classList.toggle("hidden", !primary || !comparison);
  if (!primary || !comparison) {
    elements.comparisonCards.replaceChildren();
    elements.comparisonNote.textContent = "";
    return;
  }

  elements.comparisonCards.replaceChildren(
    comparisonCard(primary, "Your baseline"),
    comparisonCard(comparison, "Searched profile"),
  );

  const difference =
    comparison.stats.totalPlayTimeSeconds - primary.stats.totalPlayTimeSeconds;
  const subject = comparison.player.onlineId;
  if (difference === 0) {
    elements.comparisonNote.textContent = "Both profiles have the same recorded playtime.";
  } else {
    elements.comparisonNote.textContent = `${subject} has ${formatDuration(
      Math.abs(difference),
    )} ${difference > 0 ? "more" : "less"} recorded playtime.`;
  }
}

function comparisonCard(data, label) {
  const card = node("article", "glass rounded-2xl border border-white/10 p-5");
  const heading = node("div", "flex items-center gap-3");
  const image = document.createElement("img");
  image.className = "h-11 w-11 rounded-xl bg-slate-800 object-cover";
  image.src = data.player.avatarUrl || avatarFallback(data.player.onlineId);
  image.alt = "";
  const names = node("div");
  names.append(
    node("p", "text-xs uppercase tracking-wider text-slate-500", label),
    node("h3", "font-black", data.player.onlineId),
  );
  heading.append(image, names);
  const metrics = node("div", "mt-5 grid grid-cols-2 gap-3");
  metrics.append(
    metric("Playtime", formatDuration(data.stats.totalPlayTimeSeconds)),
    metric("Games", formatNumber(data.stats.totalGames)),
  );
  card.append(heading, metrics);
  return card;
}

function metric(label, value) {
  const item = node("div", "rounded-xl bg-white/5 p-3");
  item.append(
    node("p", "text-xs text-slate-500", label),
    node("p", "mt-1 font-black tabular-nums", value),
  );
  return item;
}

function renderTopGames() {
  const top = [...state.games]
    .sort((a, b) => b.playTimeSeconds - a.playTimeSeconds)
    .slice(0, 10);
  const maximum = top[0]?.playTimeSeconds || 1;
  elements.topGames.replaceChildren(
    ...top.map((game, index) => {
      const item = node("article", "glass flex items-center gap-4 rounded-2xl border border-white/10 p-4");
      const rank = node("span", "w-8 text-center text-xl font-black text-slate-600", String(index + 1).padStart(2, "0"));
      const image = document.createElement("img");
      image.className = "game-icon game-cover-glow h-14 w-14 rounded-xl";
      image.src = game.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      const body = node("div", "min-w-0 flex-1");
      const row = node("div", "top-game-row flex justify-between gap-3");
      row.append(
        node("p", "truncate font-bold", game.name),
        node("p", "shrink-0 text-sm text-cyan tabular-nums", formatDuration(game.playTimeSeconds)),
      );
      const track = node("div", "mt-2 h-1.5 overflow-hidden rounded-full bg-white/5");
      const bar = node("div", "h-full rounded-full bg-gradient-to-r from-electric to-cyan");
      bar.style.width = `${Math.max(2, (game.playTimeSeconds / maximum) * 100)}%`;
      track.append(bar);
      body.append(row, track);
      item.append(rank, image, body);
      makeTrophyInteractive(item, game);
      return item;
    }),
  );
}

function renderGames() {
  const filtered = state.games.filter((game) =>
    game.name.toLocaleLowerCase("en").includes(state.query),
  );
  filtered.sort((a, b) => {
    if (state.sort === "recent") {
      return new Date(b.lastPlayedAt || 0) - new Date(a.lastPlayedAt || 0);
    }
    if (state.sort === "alpha") return a.name.localeCompare(b.name, "en");
    return b.playTimeSeconds - a.playTimeSeconds;
  });

  const visible = filtered.slice(0, state.visible);
  elements.gameCount.textContent = `${formatNumber(filtered.length)} of ${formatNumber(state.games.length)} games`;
  elements.games.replaceChildren(...visible.map(gameCard));
  elements.showMore.classList.toggle("hidden", visible.length >= filtered.length);
}

function gameCard(game) {
  const card = node("article", "game-card glass overflow-hidden rounded-2xl border border-white/10");
  const image = document.createElement("img");
  image.className = "game-icon game-cover-glow w-full";
  image.src = game.imageUrl;
  image.alt = `Game icon for ${game.name}`;
  image.loading = "lazy";
  const body = node("div", "p-5");
  body.append(
    platformBadge(game.platform),
    node("h3", "mt-2 truncate text-lg font-bold", game.name),
  );
  const details = node("div", "game-details mt-4 flex items-end justify-between gap-3");
  const played = node("div");
  played.append(
    node("p", "text-xl font-black tabular-nums", formatDuration(game.playTimeSeconds)),
    node("p", "mt-1 text-xs text-slate-500", `First played ${formatDate(game.firstPlayedAt)}`),
    node("p", "text-xs text-slate-500", `Last played ${formatDate(game.lastPlayedAt)}`),
  );
  const trophy = game.trophies
    ? node("span", "rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300", `${game.trophies.progress}% · View trophies`)
    : node("span", "text-xs text-slate-600", "No trophy data");
  details.append(played, trophy);
  body.append(details);
  card.append(image, body);
  makeTrophyInteractive(card, game);
  return card;
}

function makeTrophyInteractive(element, game) {
  if (!game.trophies?.npCommunicationId) return;
  element.classList.add("cursor-pointer");
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `View trophies for ${game.name}`);
  element.addEventListener("click", () => openGameTrophies(game));
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openGameTrophies(game);
  });
}

function openTrophyOverview() {
  if (!state.primary) return;
  if (!elements.trophyDialog.open) elements.trophyDialog.showModal();
  renderTrophyOverview();
}

function renderTrophyOverview() {
  const titles = [...(state.primary?.trophyTitles || [])].sort(
    (a, b) =>
      new Date(b.lastUpdatedAt || 0) - new Date(a.lastUpdatedAt || 0) ||
      a.name.localeCompare(b.name, "en"),
  );
  state.activeTrophyData = null;
  state.trophyEarnedOnly = false;
  elements.earnedOnly.checked = false;
  elements.earnedOnlyWrap.classList.add("hidden");
  elements.trophyBack.classList.add("hidden");
  elements.trophyTitle.textContent = `${state.primary?.player.onlineId || "Player"}’s trophies`;
  elements.trophySubtitle.textContent = `${formatNumber(titles.length)} games with trophy sets. Select a game to view every trophy.`;
  elements.trophyStatus.textContent = "";

  if (!titles.length) {
    elements.trophyContent.replaceChildren(
      node(
        "p",
        "rounded-2xl border border-white/10 p-5 text-sm text-slate-400",
        "No visible trophy sets were returned for this profile.",
      ),
    );
    return;
  }

  const overviewNodes = [];
  const earnedByGrade =
    state.primary?.stats?.trophySummary?.earnedTrophies || null;
  if (earnedByGrade) {
    const summary = node(
      "div",
      "mb-2 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[.02] p-3 sm:grid-cols-4",
    );
    ["bronze", "silver", "gold", "platinum"].forEach((grade) => {
      const item = node(
        "div",
        "flex items-center gap-3 rounded-xl bg-white/[.025] p-2.5",
      );
      item.append(
        trophyGradeIcon(grade),
        node(
          "span",
          "font-black tabular-nums",
          formatNumber(earnedByGrade[grade]),
        ),
      );
      summary.append(item);
    });
    overviewNodes.push(summary);
  }
  overviewNodes.push(
    ...titles.map((title) => {
      const button = node(
        "button",
        "trophy-row flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-3 text-left",
      );
      button.type = "button";
      const image = document.createElement("img");
      image.className =
        "game-cover-glow h-16 w-16 shrink-0 rounded-xl bg-slate-800 object-cover";
      image.src = title.iconUrl || avatarFallback(title.name);
      image.alt = "";
      image.loading = "lazy";
      const body = node("div", "min-w-0 flex-1");
      body.append(node("p", "truncate font-bold", title.name));
      const meta = node("div", "mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500");
      meta.append(
        platformBadge(title.platform),
        document.createTextNode(
          `· ${trophyCount(title.earned)} of ${trophyCount(title.defined)} earned`,
        ),
      );
      body.append(meta);
      const progress = node("div", "mt-2 h-1.5 overflow-hidden rounded-full bg-white/5");
      const bar = node("div", "h-full rounded-full bg-gradient-to-r from-electric to-cyan");
      bar.style.width = `${Math.max(0, Math.min(100, Number(title.progress || 0)))}%`;
      progress.append(bar);
      body.append(progress);
      button.append(
        image,
        body,
        node("span", "shrink-0 text-sm font-bold text-cyan", `${title.progress || 0}%`),
      );
      button.addEventListener("click", () => openTrophyTitle(title));
      return button;
    }),
  );
  elements.trophyContent.replaceChildren(
    ...overviewNodes,
  );
}

function openGameTrophies(game) {
  const matchedTitle = (state.primary?.trophyTitles || []).find(
    (item) =>
      item.npCommunicationId === game.trophies?.npCommunicationId,
  );
  const title = {
    ...(matchedTitle || {}),
    npCommunicationId:
      matchedTitle?.npCommunicationId || game.trophies?.npCommunicationId,
    name: matchedTitle?.name || game.name,
    iconUrl: game.imageUrl || matchedTitle?.iconUrl || "",
    platform: game.platform || matchedTitle?.platform,
    progress: matchedTitle?.progress ?? game.trophies?.progress ?? 0,
  };
  if (!elements.trophyDialog.open) elements.trophyDialog.showModal();
  void openTrophyTitle(title);
}

async function openTrophyTitle(title) {
  if (!title?.npCommunicationId || !state.primary) return;
  state.activeTrophyData = null;
  state.trophyEarnedOnly = false;
  elements.earnedOnly.checked = false;
  elements.earnedOnlyWrap.classList.remove("hidden");
  elements.trophyBack.classList.remove("hidden");
  elements.trophyTitle.textContent = title.name;
  elements.trophySubtitle.replaceChildren(
    platformBadge(title.platform),
    document.createTextNode(` · ${title.progress || 0}% complete`),
  );
  elements.trophyStatus.textContent = "Loading trophies …";
  elements.trophyContent.replaceChildren(
    node("div", "skeleton h-24 rounded-2xl bg-white/5"),
    node("div", "skeleton h-24 rounded-2xl bg-white/5"),
    node("div", "skeleton h-24 rounded-2xl bg-white/5"),
  );

  try {
    const data = await fetchTrophyDetails(title.npCommunicationId);
    renderTrophyDetails(data);
  } catch (error) {
    elements.trophyStatus.textContent = error.message;
    elements.trophyStatus.className = "min-h-6 py-2 text-sm text-rose-400";
    elements.trophyContent.replaceChildren();
  }
}

async function fetchTrophyDetails(npCommunicationId) {
  const settings = readSettings();
  const headers = {};
  if (state.sessionNpsso) headers["X-NPSSO-Override"] = state.sessionNpsso;
  if (
    settings.legacyPsn &&
    settings.defaultPsn.toLowerCase() ===
      state.primary.player.onlineId.toLowerCase()
  ) {
    headers["X-PSN-Legacy-ID"] = settings.legacyPsn;
  }
  const response = await fetch(
    `${API_BASE_URL}/api/player/${encodeURIComponent(
      state.primary.player.onlineId,
    )}/trophies/${encodeURIComponent(npCommunicationId)}`,
    { headers },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error ||
        "Could not load this trophy set. Reopen the NPSSO override if authentication expired.",
    );
  }
  return data;
}

function renderTrophyDetails(data) {
  state.activeTrophyData = data;
  const earnedCount = data.trophies.filter((trophy) => trophy.earned).length;
  const visibleTrophies = state.trophyEarnedOnly
    ? data.trophies.filter((trophy) => trophy.earned)
    : data.trophies;
  elements.trophyStatus.className = "min-h-6 py-2 text-sm text-slate-400";
  elements.trophyStatus.textContent = state.trophyEarnedOnly
    ? `${formatNumber(earnedCount)} earned trophies shown.`
    : `${formatNumber(earnedCount)} of ${formatNumber(data.trophies.length)} trophies earned.`;
  if (!visibleTrophies.length) {
    elements.trophyContent.replaceChildren(
      node(
        "p",
        "rounded-2xl border border-white/10 p-5 text-sm text-slate-400",
        "No earned trophies in this set yet.",
      ),
    );
    return;
  }
  elements.trophyContent.replaceChildren(
    ...visibleTrophies.map((trophy) => {
      const row = node(
        "article",
        `trophy-row flex items-start gap-4 rounded-2xl border p-4 ${
          trophy.earned
            ? "border-cyan/25 bg-cyan/[.04]"
            : "border-white/10 bg-white/[.02] opacity-75"
        }`,
      );
      const image = document.createElement("img");
      image.className =
        "h-16 w-16 shrink-0 rounded-xl bg-slate-800 object-cover shadow-lg";
      image.src = trophy.iconUrl || avatarFallback(trophy.name);
      image.alt = "";
      image.loading = "lazy";
      const body = node("div", "min-w-0 flex-1");
      const heading = node("div", "flex flex-wrap items-center gap-2");
      heading.append(
        trophyGradeIcon(trophy.type),
        node("h3", "font-bold", trophy.name),
      );
      body.append(
        heading,
        node("p", "mt-1 text-sm leading-relaxed text-slate-400", trophy.detail || ""),
      );
      const meta = [];
      if (trophy.earned) meta.push(`Earned ${formatDate(trophy.earnedAt)}`);
      if (trophy.earnedRate !== null) meta.push(`${trophy.earnedRate}% earned rate`);
      body.append(
        node(
          "p",
          `mt-2 text-xs ${trophy.earned ? "text-cyan" : "text-slate-600"}`,
          trophy.earned ? meta.join(" · ") || "Earned" : meta.join(" · ") || "Not earned",
        ),
      );
      row.append(image, body);
      return row;
    }),
  );
}

function trophyGradeIcon(value) {
  const grade = ["bronze", "silver", "gold", "platinum"].includes(
    String(value).toLowerCase(),
  )
    ? String(value).toLowerCase()
    : "bronze";
  const badge = node(
    "span",
    `trophy-grade trophy-grade-${grade}`,
  );
  badge.setAttribute("role", "img");
  badge.setAttribute(
    "aria-label",
    `${grade[0].toUpperCase()}${grade.slice(1)} trophy`,
  );
  badge.title = `${grade[0].toUpperCase()}${grade.slice(1)} trophy`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const paths = [
    "M8 4h8v4a4 4 0 0 1-8 0V4Z",
    "M8 6H5v1a4 4 0 0 0 4 4",
    "M16 6h3v1a4 4 0 0 1-4 4",
    "M12 12v5",
    "M8.5 20h7",
    "M10 17h4",
  ];
  paths.forEach((definition) => {
    const path = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path.setAttribute("d", definition);
    svg.append(path);
  });
  badge.append(svg);
  return badge;
}

function trophyCount(counts = {}) {
  return Object.values(counts).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
}

function getTrophyTotal(stats) {
  const earned = stats.trophySummary?.earnedTrophies;
  return earned
    ? Object.values(earned).reduce((sum, value) => sum + Number(value || 0), 0)
    : null;
}

function setLoading(loading, message = "") {
  const button = elements.form.querySelector("button[type='submit']");
  button.disabled = loading;
  button.textContent = loading
    ? "Loading …"
    : state.primary
      ? "Compare"
      : "Explore";
  if (message) setMessage(message);
}

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.className = `mt-4 min-h-6 whitespace-pre-line text-sm ${
    isError ? "text-rose-400" : "text-slate-400"
  }`;
}

function formatDate(value) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function platformBadge(value, extraClass = "") {
  const label = displayPlatform(value);
  const badge = node("span", `platform-badge ${extraClass}`.trim());
  const platforms = [];
  if (label.includes("PS4")) platforms.push("PS4");
  if (label.includes("PS5")) platforms.push("PS5");

  if (!platforms.length) {
    badge.classList.add(
      "text-xs",
      "font-bold",
      "uppercase",
      "tracking-wider",
      "text-cyan",
    );
    badge.textContent = label;
    return badge;
  }

  badge.setAttribute("role", "img");
  badge.setAttribute("aria-label", platforms.join(" and "));
  platforms.forEach((platform, index) => {
    if (index) {
      badge.append(node("span", "text-[10px] text-slate-600", "/"));
    }
    const image = document.createElement("img");
    image.className = "platform-wordmark";
    image.src =
      platform === "PS5"
        ? "./assets/ps5-wordmark.svg"
        : "./assets/ps4-wordmark.svg";
    image.alt = "";
    badge.append(image);
  });
  return badge;
}

function displayPlatform(value) {
  const platform = String(value || "PlayStation").trim();
  const lower = platform.toLowerCase();
  if (lower.includes("ps4") && lower.includes("ps5")) return "PS4 / PS5";
  if (lower.includes("ps5")) return "PS5";
  if (lower.includes("ps4")) return "PS4";
  if (lower.includes("ps3")) return "PS3";
  if (lower.includes("vita")) return "PS Vita";
  if (lower.includes("pc")) return "PC";
  return platform;
}

function node(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function avatarFallback(name) {
  const letter = encodeURIComponent((name || "P")[0].toUpperCase());
  return `https://placehold.co/160x160/0d1728/2d9cff?text=${letter}`;
}

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      defaultPsn:
        typeof saved.defaultPsn === "string" ? saved.defaultPsn : "",
      legacyPsn:
        typeof saved.legacyPsn === "string" ? saved.legacyPsn : "",
      autoLoad: Boolean(saved.autoLoad),
      showLegacyId: Boolean(saved.showLegacyId),
      showTrophyGames: Boolean(saved.showTrophyGames),
      topGamesOnTop: Boolean(saved.topGamesOnTop),
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
      psColors: false,
    };
  }
}

function applyTheme(usePsColors) {
  document.documentElement.dataset.theme = usePsColors
    ? "playstation"
    : "steam";
}

function positionTopGames(settings = readSettings()) {
  if (!elements.topGamesSection || !elements.gamesSection) return;
  if (settings.topGamesOnTop) {
    elements.stats.after(elements.topGamesSection);
  } else {
    elements.gamesSection.after(elements.topGamesSection);
  }
}

function setLivePlaytimeBaseline(data) {
  state.livePlaytimeBase = Number(data.stats?.totalPlayTimeSeconds || 0);
  state.livePlaytimeStartedAt =
    data.presence?.status === "playing" &&
    !data.meta?.localOffline &&
    navigator.onLine
      ? Date.now()
      : 0;
}

function currentLivePlaytime() {
  if (!state.livePlaytimeStartedAt) return state.livePlaytimeBase;
  const elapsed = Math.floor(
    (Date.now() - state.livePlaytimeStartedAt) / LIVE_TIME_INTERVAL_MS,
  );
  return state.livePlaytimeBase + elapsed * (LIVE_TIME_INTERVAL_MS / 1000);
}

function updateLivePlaytime() {
  const value = document.querySelector("[data-live-playtime]");
  if (value) value.textContent = formatDuration(currentLivePlaytime());
}

function freezeLivePlaytime() {
  state.livePlaytimeBase = currentLivePlaytime();
  state.livePlaytimeStartedAt = 0;
  updateLivePlaytime();
}

async function refreshPrimaryProfile() {
  if (
    state.refreshRunning ||
    !state.primary ||
    !navigator.onLine ||
    document.visibilityState !== "visible"
  ) {
    return;
  }
  state.refreshRunning = true;
  try {
    const settings = readSettings();
    const onlineId = state.primary.player.onlineId;
    const legacyOnlineId =
      settings.defaultPsn.toLowerCase() === onlineId.toLowerCase()
        ? settings.legacyPsn
        : "";
    const data = await fetchPlayer(
      onlineId,
      state.sessionNpsso,
      legacyOnlineId,
    );
    try {
      await saveProfileSnapshot(data);
    } catch {
      // Continue showing fresh PSN data if offline storage is unavailable.
    }
    void cacheProfileImages(data);
    if (data.meta?.fetchedAt !== state.primary.meta?.fetchedAt) {
      applyPrimaryProfile(data);
      setMessage(`Updated ${formatDate(data.meta.fetchedAt)}.`);
    }
  } catch {
    // Keep the current or offline snapshot visible until the next refresh.
  } finally {
    state.refreshRunning = false;
  }
}

function updateUrl() {
  if (!state.primary) return;
  const params = new URLSearchParams();
  params.set("player", state.primary.player.onlineId);
  if (state.comparison) {
    params.set("compare", state.comparison.player.onlineId);
  }
  history.replaceState(null, "", `?${params.toString()}`);
}

async function initialise() {
  const params = new URLSearchParams(location.search);
  const initialPlayer = params.get("player");
  const initialComparison = params.get("compare");
  const settings = readSettings();
  const primaryId =
    initialPlayer ||
    (settings.autoLoad && /^[A-Za-z0-9_-]{3,16}$/.test(settings.defaultPsn)
      ? settings.defaultPsn
      : "");

  if (!primaryId) return;
  elements.input.value = primaryId;
  await loadPlayer(primaryId, "primary");
  if (initialComparison && state.primary) {
    elements.input.value = initialComparison;
    await loadPlayer(initialComparison, "comparison");
  }
}

setInterval(updateLivePlaytime, LIVE_TIME_INTERVAL_MS);
setInterval(() => void refreshPrimaryProfile(), PROFILE_REFRESH_INTERVAL_MS);
addEventListener("online", () => void refreshPrimaryProfile());
addEventListener("offline", freezeLivePlaytime);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshPrimaryProfile();
  }
});

void initialise();

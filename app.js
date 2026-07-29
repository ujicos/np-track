import { formatDuration, normaliseNpssoInput } from "./utils.js";

const API_BASE_URL = "https://np-track-api.ujicos.workers.dev";
const PAGE_SIZE = 24;
const SETTINGS_KEY = "np-track.settings";

const state = {
  primary: null,
  comparison: null,
  games: [],
  visible: PAGE_SIZE,
  query: "",
  sort: "hours",
  sessionNpsso: "",
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
  topGames: document.querySelector("#top-games"),
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
  psColors: document.querySelector("#ps-colors"),
  settingsMessage: document.querySelector("#settings-message"),
  trophyDialog: document.querySelector("#trophy-dialog"),
  trophyBack: document.querySelector("#trophy-back"),
  closeTrophies: document.querySelector("#close-trophies"),
  trophyTitle: document.querySelector("#trophy-dialog-title"),
  trophySubtitle: document.querySelector("#trophy-dialog-subtitle"),
  trophyStatus: document.querySelector("#trophy-status"),
  trophyContent: document.querySelector("#trophy-content"),
};

applyTheme(readSettings().psColors);

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

elements.closeTrophies.addEventListener("click", () => {
  elements.trophyDialog.close();
});

elements.trophyBack.addEventListener("click", () => {
  renderTrophyOverview();
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
    psColors: elements.psColors.checked,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyTheme(settings.psColors);
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
    const data = await fetchPlayer(onlineId, npssoOverride, legacyOnlineId);
    if (mode === "comparison") {
      state.comparison = data;
      renderComparison();
    } else {
      state.primary = data;
      state.comparison = null;
      state.games = data.games || [];
      state.visible = PAGE_SIZE;
      state.query = "";
      elements.gameSearch.value = "";
      renderProfile(data);
      renderStats(data);
      renderTopGames();
      renderGames();
      renderComparison();
      elements.results.classList.remove("hidden");
    }

    const cacheMessage =
      data.meta.cache === "BYPASS"
        ? `Updated ${formatDate(data.meta.fetchedAt)} with the temporary override.\nNothing was cached.`
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
  const response = await fetch(
    `${API_BASE_URL}/api/player/${encodeURIComponent(onlineId)}`,
    {
      headers,
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load this profile.");
  return data;
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

  const labels = {
    playing: `Playing now (${displayPlatform(presence.platform)})`,
    online: `Online (${displayPlatform(presence.platform)})`,
    offline: "Offline",
    unknown: "Status unavailable or hidden",
  };
  elements.presenceLabel.textContent = labels[presence.status] || labels.unknown;
  elements.presenceNote.textContent = presence.note || "";
  elements.statusDot.className = `h-2.5 w-2.5 rounded-full ${
    presence.online ? "bg-emerald-400 shadow-[0_0_12px_#34d399]" : "bg-slate-500"
  }`;

  const game = presence.currentGames?.[0];
  elements.currentGame.classList.toggle("hidden", !game);
  if (game) {
    elements.currentGame.replaceChildren(
      node("p", "text-xs font-bold uppercase tracking-wider text-cyan", "Playing now"),
      node("p", "mt-1 font-bold", game.name),
      node("p", "mt-1 text-xs font-semibold text-slate-400", displayPlatform(game.platform)),
    );
  }
}

function renderStats(data) {
  const { stats } = data;
  const trophyTotal = getTrophyTotal(stats);
  const cards = [
    {
      label: "Total playtime",
      value: formatDuration(stats.totalPlayTimeSeconds),
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
    ...cards.map(({ label, value, detail, action }) => {
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
      card.append(
        node("p", "text-sm text-slate-400", label),
        node("p", "mt-2 text-2xl font-black tabular-nums", value),
      );
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
      image.className = "game-cover-glow h-14 w-14 rounded-xl bg-slate-800 object-cover";
      image.src = game.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      const body = node("div", "min-w-0 flex-1");
      const row = node("div", "flex justify-between gap-3");
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
  image.className = "game-cover-glow aspect-video w-full bg-slate-800 object-cover";
  image.src = game.screenshotUrl || game.imageUrl;
  image.alt = `Cover art for ${game.name}`;
  image.loading = "lazy";
  const body = node("div", "p-5");
  body.append(
    node("p", "text-xs font-bold uppercase tracking-wider text-cyan", displayPlatform(game.platform)),
    node("h3", "mt-2 truncate text-lg font-bold", game.name),
  );
  const details = node("div", "mt-4 flex items-end justify-between gap-3");
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

  elements.trophyContent.replaceChildren(
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
      body.append(
        node("p", "truncate font-bold", title.name),
        node(
          "p",
          "mt-1 text-xs text-slate-500",
          `${displayPlatform(title.platform)} · ${trophyCount(title.earned)} of ${trophyCount(title.defined)} earned`,
        ),
      );
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
}

function openGameTrophies(game) {
  const title = (state.primary?.trophyTitles || []).find(
    (item) =>
      item.npCommunicationId === game.trophies?.npCommunicationId,
  ) || {
    npCommunicationId: game.trophies?.npCommunicationId,
    name: game.name,
    iconUrl: game.imageUrl,
    platform: game.platform,
    progress: game.trophies?.progress || 0,
  };
  if (!elements.trophyDialog.open) elements.trophyDialog.showModal();
  void openTrophyTitle(title);
}

async function openTrophyTitle(title) {
  if (!title?.npCommunicationId || !state.primary) return;
  elements.trophyBack.classList.remove("hidden");
  elements.trophyTitle.textContent = title.name;
  elements.trophySubtitle.textContent = `${displayPlatform(title.platform)} · ${title.progress || 0}% complete`;
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
  const earnedCount = data.trophies.filter((trophy) => trophy.earned).length;
  elements.trophyStatus.className = "min-h-6 py-2 text-sm text-slate-400";
  elements.trophyStatus.textContent = `${formatNumber(earnedCount)} of ${formatNumber(data.trophies.length)} trophies earned.`;
  elements.trophyContent.replaceChildren(
    ...data.trophies.map((trophy) => {
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
        node("h3", "font-bold", trophy.name),
        node(
          "span",
          "rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400",
          trophy.type || "trophy",
        ),
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
      psColors: false,
    };
  }
}

function applyTheme(usePsColors) {
  document.documentElement.dataset.theme = usePsColors
    ? "playstation"
    : "steam";
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

void initialise();

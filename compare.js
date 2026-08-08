import {
  findGamesByTitle,
  formatDuration,
  isShareFactoryTitle,
} from "./utils.js";
import {
  cacheGameIcons,
  getProfileSnapshot,
  saveProfileSnapshot,
} from "./offline-cache.js";

const API_BASE_URL = "https://np-track-api.ujicos.workers.dev";
const SETTINGS_KEY = "np-track.settings";

const form = document.querySelector("#compare-form");
const firstInput = document.querySelector("#player-one");
const secondInput = document.querySelector("#player-two");
const button = document.querySelector("#compare-button");
const message = document.querySelector("#compare-message");
const results = document.querySelector("#compare-results");
const summary = document.querySelector("#comparison-summary");
const cards = document.querySelector("#compare-cards");
const sharedStats = document.querySelector("#shared-stats");
const sharedGames = document.querySelector("#shared-games");
const sharedGameCount = document.querySelector("#shared-game-count");
const compareModeButton = document.querySelector("#compare-mode");
const combineModeButton = document.querySelector("#combine-mode");
const compareFields = document.querySelector("#compare-fields");
const combineFields = document.querySelector("#combine-fields");
const modeDescription = document.querySelector("#mode-description");
const combineProfiles = document.querySelector("#combine-profiles");
const addProfileButton = document.querySelector("#add-profile");
const combineFullAccount = document.querySelector("#combine-full-account");
const combineSpecificGames = document.querySelector("#combine-specific-games");
const gameQueryWrap = document.querySelector("#game-query-wrap");
const gameQueries = document.querySelector("#game-queries");
const combineResults = document.querySelector("#combine-results");
const combineSummary = document.querySelector("#combine-summary");
const combinedAccounts = document.querySelector("#combined-accounts");
const combinedGamesSection = document.querySelector("#combined-games-section");
const combinedGames = document.querySelector("#combined-games");

const initialSettings = readSettings();
const initialParams = new URLSearchParams(location.search);
firstInput.value = initialParams.get("first") || initialSettings.defaultPsn;
secondInput.value = initialParams.get("second") || "";
let activeMode = initialParams.get("mode") === "combine" ? "combine" : "compare";

const initialProfiles = (initialParams.get("profiles") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
while (initialProfiles.length < 2) initialProfiles.push("");
if (!initialProfiles[0]) initialProfiles[0] = initialSettings.defaultPsn;
initialProfiles.forEach((value) => addCombineProfile(value));
gameQueries.value = initialParams.get("games") || "";
if (gameQueries.value) combineSpecificGames.checked = true;
setMode(activeMode);

compareModeButton.addEventListener("click", () => setMode("compare"));
combineModeButton.addEventListener("click", () => setMode("combine"));
addProfileButton.addEventListener("click", () => {
  addCombineProfile();
  combineProfiles.lastElementChild?.querySelector("input")?.focus();
});
combineSpecificGames.addEventListener("change", updateGameQueryVisibility);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeMode === "combine") {
    await submitCombination();
    return;
  }
  const firstId = firstInput.value.trim();
  const secondId = secondInput.value.trim();
  if (firstId.toLowerCase() === secondId.toLowerCase()) {
    setMessage("Enter two different PSN online IDs.", true);
    return;
  }

  setLoading(true);
  setMessage("Loading both accounts …");
  results.classList.add("hidden");
  combineResults.classList.add("hidden");
  try {
    const [first, second] = await Promise.all([
      fetchPlayerWithOffline(firstId, legacyIdFor(firstId)),
      fetchPlayerWithOffline(secondId, legacyIdFor(secondId)),
    ]);
    renderComparison(first, second);
    const params = new URLSearchParams();
    params.set("first", first.player.onlineId);
    params.set("second", second.player.onlineId);
    history.replaceState({}, "", `${location.pathname}?${params}`);
    setMessage(
      first.meta?.localOffline || second.meta?.localOffline
        ? "Showing the latest saved data because the network is unavailable."
        : "",
    );
  } catch (error) {
    setMessage(error.message || "Could not compare these accounts.", true);
  } finally {
    setLoading(false);
  }
});

function setMode(mode) {
  activeMode = mode;
  const combining = mode === "combine";
  compareFields.classList.toggle("hidden", combining);
  combineFields.classList.toggle("hidden", !combining);
  firstInput.required = !combining;
  secondInput.required = !combining;
  compareModeButton.setAttribute("aria-selected", String(!combining));
  combineModeButton.setAttribute("aria-selected", String(combining));
  compareModeButton.className = modeButtonClass(!combining);
  combineModeButton.className = modeButtonClass(combining);
  modeDescription.textContent = combining
    ? "Add two or more profiles, then combine their total account playtime, selected games, or both."
    : "Enter two PSN online IDs to compare their visible playtime, games, and trophies.";
  button.textContent = combining ? "Combine playtime" : "Compare accounts";
  results.classList.add("hidden");
  combineResults.classList.add("hidden");
  setMessage("");
  updateGameQueryVisibility();
}

function modeButtonClass(selected) {
  return `rounded-lg px-5 py-2.5 text-sm font-bold ${
    selected ? "bg-white/10 text-white" : "text-slate-400"
  }`;
}

function addCombineProfile(value = "") {
  const row = node("label", "relative block");
  const label = node("span", "mb-2 block text-xs font-bold text-slate-400", "PSN online ID");
  const input = document.createElement("input");
  input.required = activeMode === "combine";
  input.minLength = 3;
  input.maxLength = 16;
  input.pattern = "[A-Za-z0-9_-]+";
  input.autocomplete = "off";
  input.placeholder = "PSN online ID";
  input.value = value;
  input.className = "combine-profile-input w-full rounded-xl border border-white/10 bg-ink px-4 py-3 pr-12 outline-none focus:border-cyan";
  const remove = node("button", "absolute bottom-1 right-1 grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", "Remove profile");
  remove.addEventListener("click", () => {
    if (combineProfiles.children.length <= 2) return;
    row.remove();
    updateRemoveButtons();
  });
  row.append(label, input, remove);
  combineProfiles.append(row);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const removable = combineProfiles.children.length > 2;
  combineProfiles.querySelectorAll("button").forEach((remove) => {
    remove.disabled = !removable;
    remove.classList.toggle("invisible", !removable);
  });
}

function updateGameQueryVisibility() {
  gameQueryWrap.classList.toggle("hidden", !combineSpecificGames.checked);
  gameQueries.required = activeMode === "combine" && combineSpecificGames.checked;
  combineProfiles.querySelectorAll("input").forEach((input) => {
    input.required = activeMode === "combine";
  });
}

async function submitCombination() {
  const onlineIds = [...combineProfiles.querySelectorAll("input")]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const uniqueIds = [...new Set(onlineIds.map((id) => id.toLowerCase()))];
  if (onlineIds.length < 2) {
    setMessage("Add at least two PSN accounts.", true);
    return;
  }
  if (uniqueIds.length !== onlineIds.length) {
    setMessage("Each PSN account can only be added once.", true);
    return;
  }
  if (!combineFullAccount.checked && !combineSpecificGames.checked) {
    setMessage("Select full account playtime, specific games, or both.", true);
    return;
  }
  const queries = gameQueries.value
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (combineSpecificGames.checked && !queries.length) {
    setMessage("Enter at least one game title to combine.", true);
    return;
  }

  setLoading(true);
  setMessage(`Loading ${onlineIds.length} accounts …`);
  results.classList.add("hidden");
  combineResults.classList.add("hidden");
  try {
    const profiles = await Promise.all(
      onlineIds.map((onlineId) =>
        fetchPlayerWithOffline(onlineId, legacyIdFor(onlineId)),
      ),
    );
    renderCombination(profiles, queries, {
      includeFullAccount: combineFullAccount.checked,
      includeSpecificGames: combineSpecificGames.checked,
    });
    const params = new URLSearchParams();
    params.set("mode", "combine");
    params.set("profiles", profiles.map((profile) => profile.player.onlineId).join(","));
    if (queries.length) params.set("games", queries.join(","));
    history.replaceState({}, "", `${location.pathname}?${params}`);
    setMessage(
      profiles.some((profile) => profile.meta?.localOffline)
        ? "Showing the latest saved data because the network is unavailable."
        : "",
    );
  } catch (error) {
    setMessage(error.message || "Could not combine these accounts.", true);
  } finally {
    setLoading(false);
  }
}

async function fetchPlayerWithOffline(onlineId, legacyOnlineId = "") {
  try {
    const headers = legacyOnlineId ? { "X-PSN-Legacy-ID": legacyOnlineId } : {};
    const response = await fetch(
      `${API_BASE_URL}/api/player/${encodeURIComponent(onlineId)}`,
      { headers },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Could not load “${onlineId}”.`);
    try {
      await saveProfileSnapshot(data);
    } catch {
      // Storage restrictions must not prevent a live comparison.
    }
    void cacheImages(data);
    return data;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    let snapshot = null;
    try {
      snapshot = await getProfileSnapshot(onlineId);
    } catch {
      // Preserve the network error if local storage is unavailable.
    }
    if (!snapshot?.data) throw new Error(`The network is unavailable and “${onlineId}” is not saved for offline use.`);
    return {
      ...snapshot.data,
      meta: { ...snapshot.data.meta, localOffline: true },
    };
  }
}

function renderComparison(first, second) {
  const settings = readSettings();
  const firstGames = visibleGames(first.games, settings);
  const secondGames = visibleGames(second.games, settings);
  const firstTotal = totalPlaytime(firstGames);
  const secondTotal = totalPlaytime(secondGames);
  const difference = Math.abs(firstTotal - secondTotal);
  const leader =
    firstTotal === secondTotal
      ? "Both accounts have the same recorded playtime."
      : `${firstTotal > secondTotal ? first.player.onlineId : second.player.onlineId} has ${formatDuration(difference)} more recorded playtime.`;
  summary.textContent = leader;

  cards.replaceChildren(
    profileCard(first, firstGames, firstTotal),
    profileCard(second, secondGames, secondTotal),
  );

  const matches = matchGames(firstGames, secondGames);
  sharedStats.replaceChildren(
    statCard("Games in common", matches.length),
    statCard(`Only ${first.player.onlineId}`, firstGames.length - matches.length),
    statCard(`Only ${second.player.onlineId}`, secondGames.length - matches.length),
  );
  sharedGameCount.textContent = `${matches.length} shared ${matches.length === 1 ? "game" : "games"}`;
  sharedGames.replaceChildren(
    ...(matches.length
      ? matches.map(({ firstGame, secondGame }) =>
          sharedGameRow(first, second, firstGame, secondGame),
        )
      : [emptyState("No matching visible games were found.")]),
  );
  results.classList.remove("hidden");
}

function renderCombination(profiles, queries, options) {
  const settings = readSettings();
  const records = profiles.map((profile) => {
    const games = visibleGames(profile.games, settings);
    return {
      profile,
      games,
      fullPlaytime: totalPlaytime(games),
      selectedPlaytime: 0,
    };
  });
  const gameResults = options.includeSpecificGames
    ? queries.map((query) => combinedGameResult(query, records))
    : [];
  records.forEach((record, profileIndex) => {
    record.selectedPlaytime = gameResults.reduce(
      (total, result) => total + result.contributions[profileIndex].seconds,
      0,
    );
  });

  const fullTotal = records.reduce(
    (total, record) => total + record.fullPlaytime,
    0,
  );
  const selectedTotal = records.reduce(
    (total, record) => total + record.selectedPlaytime,
    0,
  );
  const summaryGrid = node(
    "div",
    `grid gap-4 ${
      options.includeFullAccount && options.includeSpecificGames
        ? "sm:grid-cols-2"
        : ""
    }`,
  );
  if (options.includeFullAccount) {
    summaryGrid.append(
      combinedTotal("Combined account playtime", fullTotal, profiles.length),
    );
  }
  if (options.includeSpecificGames) {
    summaryGrid.append(
      combinedTotal("Combined selected-game playtime", selectedTotal, profiles.length),
    );
  }
  combineSummary.replaceChildren(summaryGrid);

  combinedAccounts.replaceChildren(
    ...records.map((record) => combinedProfileCard(record, options)),
  );
  combinedGamesSection.classList.toggle(
    "hidden",
    !options.includeSpecificGames,
  );
  combinedGames.replaceChildren(
    ...gameResults.map((result) => combinedGameRow(result, records)),
  );
  combineResults.classList.remove("hidden");
}

function combinedTotal(label, seconds, profileCount) {
  const block = node("div");
  block.append(
    node("p", "text-sm font-bold text-slate-400", label),
    node("p", "mt-2 text-3xl font-black tabular-nums text-cyan", formatDuration(seconds)),
    node(
      "p",
      "mt-1 text-xs text-slate-500",
      `Across ${profileCount} profiles`,
    ),
  );
  return block;
}

function combinedProfileCard(record, options) {
  const card = node(
    "article",
    "glass flex items-center gap-4 rounded-2xl border border-white/10 p-4",
  );
  const avatar = document.createElement("img");
  avatar.className = "h-14 w-14 shrink-0 rounded-xl object-contain";
  avatar.src =
    record.profile.player.avatarUrl ||
    avatarFallback(record.profile.player.onlineId);
  avatar.alt = "";
  const body = node("div", "min-w-0 flex-1");
  body.append(
    node("h3", "truncate font-bold", record.profile.player.onlineId),
  );
  if (options.includeFullAccount) {
    body.append(
      contributionLine("Account total", record.fullPlaytime),
    );
  }
  if (options.includeSpecificGames) {
    body.append(
      contributionLine("Selected games", record.selectedPlaytime),
    );
  }
  card.append(avatar, body);
  return card;
}

function combinedGameResult(query, records) {
  const contributions = records.map((record) => {
    const games = findGamesByTitle(record.games, query);
    return {
      games,
      seconds: totalPlaytime(games),
    };
  });
  const representative = contributions
    .flatMap((contribution) => contribution.games)
    .sort(
      (left, right) =>
        Number(right.playTimeSeconds || 0) - Number(left.playTimeSeconds || 0),
    )[0];
  return {
    query,
    name: representative?.name || query,
    imageUrl: representative?.imageUrl || "",
    contributions,
    total: contributions.reduce(
      (total, contribution) => total + contribution.seconds,
      0,
    ),
  };
}

function combinedGameRow(result, records) {
  const row = node(
    "article",
    "glass grid gap-4 rounded-2xl border border-white/10 p-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(15rem,auto)] sm:items-center",
  );
  const image = document.createElement("img");
  image.className = "h-16 w-16 rounded-xl object-contain";
  image.src = result.imageUrl || avatarFallback(result.name);
  image.alt = "";
  const heading = node("div", "min-w-0");
  heading.append(
    node("h3", "font-bold", result.name),
    node(
      "p",
      "mt-1 text-lg font-black tabular-nums text-cyan",
      formatDuration(result.total),
    ),
  );
  if (!result.contributions.some((item) => item.games.length)) {
    heading.append(
      node("p", "mt-1 text-xs text-amber-300/80", `No visible match for “${result.query}”`),
    );
  }
  const contributionList = node(
    "div",
    "grid gap-1 text-left text-sm sm:text-right",
  );
  result.contributions.forEach((contribution, index) => {
    contributionList.append(
      gameTimeLine(
        records[index].profile.player.onlineId,
        contribution.seconds,
      ),
    );
  });
  row.append(image, heading, contributionList);
  return row;
}

function contributionLine(label, seconds) {
  const line = node("p", "mt-1 text-sm text-slate-400");
  line.append(
    document.createTextNode(`${label}: `),
    node("strong", "font-bold tabular-nums text-slate-100", formatDuration(seconds)),
  );
  return line;
}

function profileCard(data, games, playtime) {
  const article = node("article", "glass rounded-3xl border border-white/10 p-5 sm:p-6");
  const heading = node("div", "flex min-w-0 items-center gap-4");
  const avatar = document.createElement("img");
  avatar.className = "h-20 w-20 shrink-0 rounded-2xl object-contain";
  avatar.src = data.player.avatarUrl || avatarFallback(data.player.onlineId);
  avatar.alt = `Profile picture for ${data.player.onlineId}`;
  const identity = node("div", "min-w-0");
  identity.append(
    node("h2", "truncate text-2xl font-black", data.player.onlineId),
    node("p", "mt-1 text-sm text-slate-400", presenceLabel(data.presence)),
  );
  heading.append(avatar, identity);

  const stats = node("div", "mt-6 grid grid-cols-3 gap-3");
  stats.append(
    miniStat("Playtime", formatDuration(playtime)),
    miniStat("Games", String(games.length)),
    miniStat("Trophies", trophyTotal(data.stats)),
  );
  article.append(heading, stats);
  return article;
}

function sharedGameRow(first, second, firstGame, secondGame) {
  const firstSeconds = Number(firstGame.playTimeSeconds || 0);
  const secondSeconds = Number(secondGame.playTimeSeconds || 0);
  const difference = Math.abs(firstSeconds - secondSeconds);
  const row = node(
    "article",
    "glass grid gap-4 rounded-2xl border border-white/10 p-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(14rem,auto)] sm:items-center",
  );
  const image = document.createElement("img");
  image.className = "h-16 w-16 rounded-xl object-contain";
  image.src = firstGame.imageUrl || secondGame.imageUrl || avatarFallback(firstGame.name);
  image.alt = "";
  const title = node("h3", "font-bold", firstGame.name || secondGame.name);
  const comparison = node("div", "grid gap-1 text-left text-sm sm:text-right");
  comparison.append(
    gameTimeLine(first.player.onlineId, firstSeconds),
    gameTimeLine(second.player.onlineId, secondSeconds),
    node(
      "p",
      "mt-1 text-xs text-slate-500",
      difference
        ? `${firstSeconds > secondSeconds ? first.player.onlineId : second.player.onlineId} +${formatDuration(difference)}`
        : "Equal playtime",
    ),
  );
  row.append(image, title, comparison);
  return row;
}

function matchGames(firstGames, secondGames) {
  const secondByName = new Map();
  secondGames.forEach((game) => {
    const key = normaliseTitle(game.name);
    if (!secondByName.has(key)) secondByName.set(key, game);
  });
  return firstGames
    .map((firstGame) => ({
      firstGame,
      secondGame: secondByName.get(normaliseTitle(firstGame.name)),
    }))
    .filter(({ secondGame }) => Boolean(secondGame))
    .sort(
      (left, right) =>
        Number(right.firstGame.playTimeSeconds || 0) +
        Number(right.secondGame.playTimeSeconds || 0) -
        Number(left.firstGame.playTimeSeconds || 0) -
        Number(left.secondGame.playTimeSeconds || 0),
    );
}

function gameTimeLine(onlineId, seconds) {
  const line = node("p", "text-slate-300");
  line.append(
    node("span", "text-slate-500", `${onlineId}: `),
    document.createTextNode(formatDuration(seconds)),
  );
  return line;
}

function statCard(label, value) {
  const card = node("article", "glass rounded-2xl border border-white/10 p-5 text-center");
  card.append(
    node("p", "text-2xl font-black", String(value)),
    node("p", "mt-1 truncate text-xs text-slate-500", label),
  );
  return card;
}

function miniStat(label, value) {
  const wrapper = node("div", "min-w-0 rounded-xl bg-black/10 p-3");
  wrapper.append(
    node("p", "truncate text-xs text-slate-500", label),
    node("p", "mt-1 truncate text-sm font-bold sm:text-base", value),
  );
  return wrapper;
}

function trophyTotal(stats = {}) {
  const earned = stats.trophySummary?.earnedTrophies;
  if (!earned) return "Hidden";
  return String(
    Object.values(earned).reduce(
      (total, amount) => total + Number(amount || 0),
      0,
    ),
  );
}

function presenceLabel(presence = {}) {
  if (presence.status === "playing") {
    const game = presence.currentGames?.[0]?.name;
    return game ? `Playing ${game}` : "Playing now";
  }
  if (presence.status === "online") return "Online";
  if (presence.status === "offline") return "Offline or activity hidden";
  return "Status unavailable";
}

function visibleGames(games = [], settings = readSettings()) {
  return settings.hideShareFactory
    ? games.filter((game) => !isShareFactoryTitle(game.name))
    : [...games];
}

function totalPlaytime(games) {
  return games.reduce(
    (total, game) => total + Number(game.playTimeSeconds || 0),
    0,
  );
}

function normaliseTitle(value) {
  return String(value || "")
    .toLocaleLowerCase("en")
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function legacyIdFor(onlineId) {
  const settings = readSettings();
  return settings.defaultPsn.toLowerCase() === onlineId.toLowerCase()
    ? settings.legacyPsn
    : "";
}

function cacheImages(data) {
  return cacheGameIcons([
    data.player?.avatarUrl,
    ...(data.games || []).map((game) => game.imageUrl),
  ]).catch(() => {});
}

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      defaultPsn: typeof saved.defaultPsn === "string" ? saved.defaultPsn : "",
      legacyPsn: typeof saved.legacyPsn === "string" ? saved.legacyPsn : "",
      hideShareFactory:
        typeof saved.hideShareFactory === "boolean" ? saved.hideShareFactory : true,
    };
  } catch {
    return { defaultPsn: "", legacyPsn: "", hideShareFactory: true };
  }
}

function setLoading(loading) {
  button.disabled = loading;
  button.textContent = loading
    ? activeMode === "combine"
      ? "Combining …"
      : "Comparing …"
    : activeMode === "combine"
      ? "Combine playtime"
      : "Compare accounts";
}

function setMessage(text, error = false) {
  message.textContent = text;
  message.className = `mx-auto mt-4 min-h-6 max-w-4xl whitespace-pre-line text-center text-sm ${
    error ? "text-rose-400" : "text-slate-400"
  }`;
}

function emptyState(text) {
  return node(
    "p",
    "glass rounded-2xl border border-white/10 p-6 text-center text-slate-400",
    text,
  );
}

function avatarFallback(name) {
  const letter = encodeURIComponent((name || "P")[0].toUpperCase());
  return `https://placehold.co/160x160/0d1728/2d9cff?text=${letter}`;
}

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

const API_BASE_URL = "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";
const PAGE_SIZE = 24;

const state = { games: [], visible: PAGE_SIZE, query: "", sort: "hours" };
const elements = {
  form: document.querySelector("#player-form"),
  input: document.querySelector("#psn-id"),
  message: document.querySelector("#message"),
  results: document.querySelector("#results"),
  avatar: document.querySelector("#avatar"),
  onlineId: document.querySelector("#online-id"),
  plusBadge: document.querySelector("#plus-badge"),
  statusDot: document.querySelector("#status-dot"),
  presenceLabel: document.querySelector("#presence-label"),
  presenceNote: document.querySelector("#presence-note"),
  currentGame: document.querySelector("#current-game"),
  stats: document.querySelector("#stats"),
  topGames: document.querySelector("#top-games"),
  gameSearch: document.querySelector("#game-search"),
  gameSort: document.querySelector("#game-sort"),
  gameCount: document.querySelector("#game-count"),
  games: document.querySelector("#games"),
  showMore: document.querySelector("#show-more"),
};

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadPlayer(elements.input.value.trim());
});
elements.gameSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLocaleLowerCase("nb");
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

async function loadPlayer(onlineId) {
  setLoading(true, "Henter data fra PlayStation Network …");
  elements.results.classList.add("hidden");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/player/${encodeURIComponent(onlineId)}`,
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Kunne ikke hente profilen.");

    state.games = data.games || [];
    state.visible = PAGE_SIZE;
    renderProfile(data);
    renderStats(data.stats);
    renderTopGames();
    renderGames();
    elements.results.classList.remove("hidden");
    elements.message.textContent =
      data.meta.cache === "HIT"
        ? `Viser hurtiglagret data fra ${formatDate(data.meta.fetchedAt)}.`
        : `Oppdatert ${formatDate(data.meta.fetchedAt)}.`;
    history.replaceState(null, "", `?player=${encodeURIComponent(data.player.onlineId)}`);
  } catch (error) {
    elements.message.textContent = error.message;
    elements.message.className = "mt-4 min-h-6 text-sm text-rose-400";
  } finally {
    setLoading(false);
  }
}

function renderProfile(data) {
  const { player, presence } = data;
  elements.avatar.src = player.avatarUrl || avatarFallback(player.onlineId);
  elements.avatar.alt = `Profilbilde for ${player.onlineId}`;
  elements.onlineId.textContent = player.onlineId;
  elements.plusBadge.classList.toggle("hidden", !player.isPlus);

  const labels = {
    playing: `Spiller nå på ${presence.platform || "PlayStation"}`,
    online: `Online på ${presence.platform || "PlayStation"}`,
    offline: "Offline",
    unknown: "Status ukjent eller skjult",
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
      node("p", "text-xs font-bold uppercase tracking-wider text-emerald-300", "Spiller nå"),
      node("p", "mt-1 font-bold", game.name),
      node("p", "mt-1 text-xs text-slate-400", game.platform || ""),
    );
  }
}

function renderStats(stats) {
  const trophySummary = stats.trophySummary;
  const earned = trophySummary?.earnedTrophies;
  const trophyTotal = earned
    ? Object.values(earned).reduce((sum, value) => sum + Number(value || 0), 0)
    : null;
  const cards = [
    ["Total spilletid", formatDuration(stats.totalPlayTimeSeconds), "Registrert av PSN"],
    ["Spill spilt", formatNumber(stats.totalGames), "Synlig spillhistorikk"],
    ["Troféspill", formatNumber(stats.trophyGames), "Spill med trofésett"],
    ["Trofeer", trophyTotal === null ? "Skjult" : formatNumber(trophyTotal), "Alle grader"],
  ];
  elements.stats.replaceChildren(
    ...cards.map(([label, value, detail]) => {
      const card = node("article", "glass rounded-2xl border border-white/10 p-5");
      card.append(
        node("p", "text-sm text-slate-400", label),
        node("p", "mt-2 text-2xl font-black", value),
        node("p", "mt-1 text-xs text-slate-600", detail),
      );
      return card;
    }),
  );
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
      image.className = "h-14 w-14 rounded-xl bg-slate-800 object-cover";
      image.src = game.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      const body = node("div", "min-w-0 flex-1");
      const row = node("div", "flex justify-between gap-3");
      row.append(
        node("p", "truncate font-bold", game.name),
        node("p", "shrink-0 text-sm text-cyan", formatDuration(game.playTimeSeconds)),
      );
      const track = node("div", "mt-2 h-1.5 overflow-hidden rounded-full bg-white/5");
      const bar = node("div", "h-full rounded-full bg-gradient-to-r from-electric to-cyan");
      bar.style.width = `${Math.max(2, (game.playTimeSeconds / maximum) * 100)}%`;
      track.append(bar);
      body.append(row, track);
      item.append(rank, image, body);
      return item;
    }),
  );
}

function renderGames() {
  const filtered = state.games.filter((game) =>
    game.name.toLocaleLowerCase("nb").includes(state.query),
  );
  filtered.sort((a, b) => {
    if (state.sort === "recent") {
      return new Date(b.lastPlayedAt || 0) - new Date(a.lastPlayedAt || 0);
    }
    if (state.sort === "alpha") return a.name.localeCompare(b.name, "nb");
    return b.playTimeSeconds - a.playTimeSeconds;
  });

  const visible = filtered.slice(0, state.visible);
  elements.gameCount.textContent = `${formatNumber(filtered.length)} av ${formatNumber(state.games.length)} spill`;
  elements.games.replaceChildren(...visible.map(gameCard));
  elements.showMore.classList.toggle("hidden", visible.length >= filtered.length);
}

function gameCard(game) {
  const card = node("article", "game-card glass overflow-hidden rounded-2xl border border-white/10");
  const image = document.createElement("img");
  image.className = "aspect-video w-full bg-slate-800 object-cover";
  image.src = game.screenshotUrl || game.imageUrl;
  image.alt = `Omslag for ${game.name}`;
  image.loading = "lazy";
  const body = node("div", "p-5");
  body.append(
    node("p", "text-xs font-bold uppercase tracking-wider text-cyan", game.platform),
    node("h3", "mt-2 truncate text-lg font-bold", game.name),
  );
  const details = node("div", "mt-4 flex items-end justify-between gap-3");
  const played = node("div");
  played.append(
    node("p", "text-xl font-black", formatDuration(game.playTimeSeconds)),
    node("p", "text-xs text-slate-500", `Sist spilt ${formatDate(game.lastPlayedAt)}`),
  );
  const trophy = game.trophies
    ? node("span", "rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300", `${game.trophies.progress}% trofeer`)
    : node("span", "text-xs text-slate-600", "Ingen trofédata");
  details.append(played, trophy);
  body.append(details);
  card.append(image, body);
  return card;
}

function setLoading(loading, message = "") {
  const button = elements.form.querySelector("button");
  button.disabled = loading;
  button.textContent = loading ? "Henter …" : "Søk";
  if (message) {
    elements.message.textContent = message;
    elements.message.className = "mt-4 min-h-6 text-sm text-slate-400";
  }
}

function formatDuration(seconds) {
  const hours = seconds / 3600;
  if (hours >= 1000) return `${formatNumber(Math.round(hours))} t`;
  if (hours >= 1) return `${hours.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} t`;
  return `${Math.round(seconds / 60)} min`;
}

function formatDate(value) {
  if (!value) return "ukjent";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("nb-NO").format(value || 0);
}

function node(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function avatarFallback(name) {
  const letter = encodeURIComponent((name || "P")[0].toUpperCase());
  return `https://placehold.co/160x160/111827/20d9ff?text=${letter}`;
}

const initialPlayer = new URLSearchParams(location.search).get("player");
if (initialPlayer) {
  elements.input.value = initialPlayer;
  loadPlayer(initialPlayer);
}

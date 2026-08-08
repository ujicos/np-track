export function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const rawHours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${rawHours}h ${minutes}m ${seconds}s`;
}

export function formatLongDuration(value) {
  let remaining = Math.max(0, Math.floor(Number(value) || 0));
  const yearSeconds = 365 * 24 * 60 * 60;
  const monthSeconds = 30 * 24 * 60 * 60;
  const daySeconds = 24 * 60 * 60;
  const years = Math.floor(remaining / yearSeconds);
  remaining %= yearSeconds;
  const months = Math.floor(remaining / monthSeconds);
  remaining %= monthSeconds;
  const days = Math.floor(remaining / daySeconds);
  remaining %= daySeconds;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const unit = (amount, singular) =>
    `${amount} ${singular}${amount === 1 ? "" : "s"}`;

  if (years) {
    return [unit(years, "year"), unit(months, "month"), unit(days, "day")].join(", ");
  }
  if (months) {
    return [unit(months, "month"), unit(days, "day")].join(", ");
  }
  return [
    unit(days, "day"),
    unit(hours, "hour"),
    unit(minutes, "minute"),
    unit(seconds, "second"),
  ].join(", ");
}

export function isShareFactoryTitle(value) {
  const compact = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return compact === "sharefactory" || compact === "sharefactorystudio";
}

export function normaliseTitleId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .split("_")[0];
}

const ROMAN_NUMERALS = new Map([
  ["i", "1"],
  ["ii", "2"],
  ["iii", "3"],
  ["iv", "4"],
  ["v", "5"],
  ["vi", "6"],
]);

export function normaliseGameSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => ROMAN_NUMERALS.get(token) || token)
    .join(" ");
}

function withoutFranchisePrefix(value) {
  return value
    .replace(/^call of duty\s+/, "")
    .replace(/^cod\s+/, "")
    .trim();
}

function compactGameSearch(value) {
  return value.replace(/\s+/g, "");
}

function gameAcronym(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => (/^\d+$/.test(token) ? token : token[0]))
    .join("");
}

export function gameSearchAliases(value) {
  const full = normaliseGameSearch(value);
  const short = withoutFranchisePrefix(full);
  return new Set(
    [
      full,
      short,
      compactGameSearch(full),
      compactGameSearch(short),
      gameAcronym(full),
      gameAcronym(short),
    ].filter(Boolean),
  );
}

function gameSearchScore(query, game) {
  const wanted = normaliseGameSearch(query);
  if (!wanted) return 0;
  const full = normaliseGameSearch(game?.name);
  const short = withoutFranchisePrefix(full);
  const wantedCompact = compactGameSearch(wanted);
  const aliases = gameSearchAliases(game?.name);
  if (wanted === full) return 100;
  if (wanted === short) return 99;
  if (aliases.has(wanted) || aliases.has(wantedCompact)) return 95;
  if (full.endsWith(` ${wanted}`) || short.endsWith(` ${wanted}`)) return 90;
  if (full.includes(wanted) || short.includes(wanted)) return 80;
  const tokens = wanted.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => full.includes(token))) return 70;
  return 0;
}

export function resolveGameQuery(games, query) {
  const available = (Array.isArray(games) ? games : []).filter(
    (game) => normaliseTitleId(game?.titleId),
  );
  const titleId = normaliseTitleId(query);
  if (/^[A-Z]{4}\d{5}$/.test(titleId)) {
    const matches = findGamesByTitleId(available, titleId);
    return matches.length
      ? { status: "resolved", titleId, game: matches[0], candidates: matches }
      : { status: "not-found", query: String(query || "").trim(), candidates: [] };
  }

  const byTitleId = new Map();
  available.forEach((game) => {
    const id = normaliseTitleId(game.titleId);
    const current = byTitleId.get(id);
    if (!current || Number(game.playTimeSeconds || 0) > Number(current.playTimeSeconds || 0)) {
      byTitleId.set(id, game);
    }
  });
  const ranked = [...byTitleId.entries()]
    .map(([id, game]) => ({ id, game, score: gameSearchScore(query, game) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (!ranked.length) {
    return { status: "not-found", query: String(query || "").trim(), candidates: [] };
  }

  const best = ranked.filter((candidate) => candidate.score === ranked[0].score);
  const concepts = new Set(
    best.map(({ game }) => String(game.conceptId || "")).filter(Boolean),
  );
  if (best.length > 1 && concepts.size !== 1) {
    return {
      status: "ambiguous",
      query: String(query || "").trim(),
      candidates: best.map(({ id, game }) => ({ ...game, resolvedTitleId: id })),
    };
  }

  const selected =
    best.find(({ game }) => /PS4/i.test(String(game.platform || ""))) || best[0];
  return {
    status: "resolved",
    titleId: selected.id,
    game: selected.game,
    candidates: best.map(({ game }) => game),
  };
}

export function findGamesByTitleId(games, titleId) {
  const wanted = normaliseTitleId(titleId);
  if (!wanted) return [];
  const available = Array.isArray(games) ? games : [];
  return available.filter(
    (game) => normaliseTitleId(game.titleId) === wanted,
  );
}

export function findGamesForCombination(
  games,
  titleId,
  { combineCrossGeneration = false, conceptIds = [] } = {},
) {
  const available = Array.isArray(games) ? games : [];
  const exact = findGamesByTitleId(available, titleId);
  const concepts = new Set(
    conceptIds
      .filter((conceptId) => conceptId !== null && conceptId !== undefined)
      .map(String),
  );
  if (!combineCrossGeneration || !concepts.size) return exact;
  return available.filter(
    (game) =>
      findGamesByTitleId([game], titleId).length > 0 ||
      (concepts.has(String(game.conceptId)) &&
        /PS4|PS5/i.test(String(game.platform || ""))),
  );
}

export function earnedTrophiesFirst(trophies, preserveOrder = false) {
  const ordered = [...(trophies || [])];
  if (preserveOrder) return ordered;
  return ordered.sort(
    (left, right) => Number(Boolean(right.earned)) - Number(Boolean(left.earned)),
  );
}

export function normaliseNpssoInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.npsso === "string") return parsed.npsso.trim();
  } catch {
    // The input may already be the raw cookie value.
  }
  return trimmed
    .replace(/^npsso=/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

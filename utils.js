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

export function findGamesByTitle(games, query) {
  const normalise = (value) =>
    String(value || "")
      .toLocaleLowerCase("en")
      .replace(/[®™©]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const wanted = normalise(query);
  if (!wanted) return [];
  const available = Array.isArray(games) ? games : [];
  const exact = available.filter((game) => normalise(game.name) === wanted);
  if (exact.length) return exact;
  const suffix = available.filter((game) =>
    normalise(game.name).endsWith(wanted),
  );
  if (suffix.length) return suffix;
  return available.filter((game) => normalise(game.name).includes(wanted));
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

export function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const rawHours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const compact = rawHours < 10 && minutes < 10 && seconds < 10;
  const hours =
    rawHours > 99
      ? "99+"
      : String(rawHours).padStart(compact ? 1 : 2, "0");
  const mins = String(minutes).padStart(compact ? 1 : 2, "0");
  const secs = String(seconds).padStart(compact ? 1 : 2, "0");
  return `${hours}h ${mins}m ${secs}s`;
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

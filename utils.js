export function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const rawHours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${rawHours}h ${minutes}m ${seconds}s`;
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

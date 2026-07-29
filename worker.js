import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getBasicPresence,
  getProfileFromAccountId,
  getUserPlayedGames,
  getUserTitles,
  getUserTrophyProfileSummary,
  makeUniversalSearch,
} from "psn-api";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const DEFAULT_TTL = 900;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        return json({ error: "Method not allowed." }, 405, cors);
      }

      const url = new URL(request.url);
      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "np-track-api" }, 200, cors);
      }

      const match = url.pathname.match(/^\/api\/player\/([^/]+)$/);
      if (!match) {
        return json(
          { error: "Not found. Use GET /api/player/:onlineId." },
          404,
          cors,
        );
      }

      const onlineId = decodeURIComponent(match[1]).trim();
      if (!/^[a-zA-Z0-9_-]{3,16}$/.test(onlineId)) {
        return json({ error: "Invalid PSN online ID." }, 400, cors);
      }

      const refresh = url.searchParams.get("refresh") === "1";
      const cacheKey = `player:v1:${onlineId.toLowerCase()}`;
      if (!refresh) {
        const cached = await env.PSN_CACHE.get(cacheKey, "json");
        if (cached) {
          return json({ ...cached, meta: { ...cached.meta, cache: "HIT" } }, 200, cors);
        }
      }

      const data = await buildPlayerResponse(onlineId, env);
      const ttl = Math.max(60, Number(env.CACHE_TTL_SECONDS) || DEFAULT_TTL);
      ctx.waitUntil(
        env.PSN_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: ttl }),
      );

      return json({ ...data, meta: { ...data.meta, cache: "MISS", ttl } }, 200, cors);
    } catch (error) {
      const message = safeErrorMessage(error);
      const status = /not found|privacy|private/i.test(message) ? 404 : 502;
      return json({ error: message }, status, cors);
    }
  },
};

async function buildPlayerResponse(onlineId, env) {
  if (!env.NPSSO) {
    throw new Error("The NPSSO Worker secret is missing.");
  }

  const accessCode = await exchangeNpssoForAccessCode(env.NPSSO);
  const auth = await exchangeAccessCodeForAuthTokens(accessCode);
  const authorization = { accessToken: auth.accessToken };
  const accountId = await resolveExactAccountId(authorization, onlineId);

  const [profileResult, presenceResult, gamesResult, trophiesResult, summaryResult] =
    await Promise.allSettled([
      getProfileFromAccountId(authorization, accountId),
      getBasicPresence(authorization, accountId),
      getAllPlayedGames(authorization, accountId),
      getAllTrophyTitles(authorization, accountId),
      getUserTrophyProfileSummary(authorization, accountId),
    ]);

  if (profileResult.status === "rejected" && gamesResult.status === "rejected") {
    throw new Error("The profile or game history is private or unavailable.");
  }

  const trophyTitles =
    trophiesResult.status === "fulfilled" ? trophiesResult.value : [];
  const trophyByName = new Map(
    trophyTitles.map((title) => [normaliseName(title.trophyTitleName), title]),
  );
  const rawGames = gamesResult.status === "fulfilled" ? gamesResult.value : [];
  const games = rawGames.map((game) => {
    const trophy = trophyByName.get(normaliseName(game.localizedName || game.name));
    return {
      titleId: game.titleId,
      name: game.localizedName || game.name,
      imageUrl: game.localizedImageUrl || game.imageUrl || "",
      category: game.category,
      platform: platformLabel(game.category),
      service: game.service,
      playCount: game.playCount || 0,
      playDuration: game.playDuration,
      playTimeSeconds: durationToSeconds(game.playDuration),
      firstPlayedAt: game.firstPlayedDateTime || null,
      lastPlayedAt: game.lastPlayedDateTime || null,
      conceptId: game.concept?.id || null,
      screenshotUrl: game.media?.screenshotUrl || "",
      trophies: trophy
        ? {
            progress: trophy.progress,
            earned: trophy.earnedTrophies,
            defined: trophy.definedTrophies,
            lastUpdatedAt: trophy.lastUpdatedDateTime,
            npCommunicationId: trophy.npCommunicationId,
          }
        : null,
    };
  });

  const totalPlayTimeSeconds = games.reduce(
    (sum, game) => sum + game.playTimeSeconds,
    0,
  );
  const presence =
    presenceResult.status === "fulfilled"
      ? mapPresence(presenceResult.value)
      : {
          online: null,
          status: "unknown",
          platform: null,
          lastOnlineAt: null,
          currentGames: [],
          note: "Presence is hidden by privacy settings or could not be retrieved.",
        };
  const profile =
    profileResult.status === "fulfilled" ? profileResult.value : {};
  const trophySummary =
    summaryResult.status === "fulfilled" ? summaryResult.value : null;

  return {
    player: {
      accountId,
      onlineId: profile.onlineId || onlineId,
      aboutMe: profile.aboutMe || "",
      avatarUrl: bestAvatar(profile.avatars),
      languages: profile.languages || [],
      isPlus: Boolean(profile.isPlus),
      isOfficiallyVerified: Boolean(profile.isOfficiallyVerified),
    },
    presence,
    stats: {
      totalGames: games.length,
      totalPlayTimeSeconds,
      totalHours: Math.round((totalPlayTimeSeconds / 3600) * 10) / 10,
      trophyGames: trophyTitles.length,
      trophySummary,
    },
    games,
    meta: {
      fetchedAt: new Date().toISOString(),
      partial: {
        profile: profileResult.status === "rejected",
        presence: presenceResult.status === "rejected",
        games: gamesResult.status === "rejected",
        trophies: trophiesResult.status === "rejected",
        trophySummary: summaryResult.status === "rejected",
      },
    },
  };
}

async function resolveExactAccountId(authorization, onlineId) {
  const response = await makeUniversalSearch(
    authorization,
    onlineId,
    "SocialAllAccounts",
  );
  const results = response.domainResponses?.flatMap((domain) => domain.results || []) || [];
  const exact = results.find(
    (result) =>
      result.socialMetadata?.onlineId?.toLowerCase() === onlineId.toLowerCase(),
  );
  if (!exact?.socialMetadata?.accountId) {
    throw new Error(`No exact PSN account was found for “${onlineId}”.`);
  }
  return exact.socialMetadata.accountId;
}

async function getAllPlayedGames(authorization, accountId) {
  const limit = 200;
  const games = [];
  let offset = 0;

  for (let page = 0; page < 20; page += 1) {
    const response = await getUserPlayedGames(authorization, accountId, {
      limit,
      offset,
      categories: "ps4_game,ps5_native_game,pspc_game,unknown",
    });
    games.push(...(response.titles || []));
    if (!response.nextOffset || response.nextOffset <= offset) break;
    offset = response.nextOffset;
  }
  return games;
}

async function getAllTrophyTitles(authorization, accountId) {
  const response = await getUserTitles(authorization, accountId, {
    limit: 800,
    offset: 0,
  });
  return response.trophyTitles || [];
}

function mapPresence(response) {
  const presence = response.basicPresence || {};
  const platformInfo = presence.primaryPlatformInfo || {};
  const online = platformInfo.onlineStatus === "online";
  const currentGames = (presence.gameTitleInfoList || []).map((game) => ({
    titleId: game.npTitleId,
    name: game.titleName,
    platform: game.launchPlatform || game.format,
    iconUrl: game.conceptIconUrl || game.npTitleIconUrl || "",
  }));

  return {
    online,
    status: online ? (currentGames.length ? "playing" : "online") : "offline",
    platform: platformInfo.platform || presence.platform || null,
    lastOnlineAt:
      platformInfo.lastOnlineDate ||
      presence.lastOnlineDate ||
      presence.lastAvailableDate ||
      null,
    currentGames,
    note: online
      ? null
      : "PSN does not reveal whether “offline” means truly offline or Appearing Offline.",
  };
}

function durationToSeconds(duration) {
  if (!duration || typeof duration !== "string") return 0;
  const match = duration.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  if (!match) return 0;
  return (
    Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0)
  );
}

function bestAvatar(avatars = []) {
  return avatars.at(-1)?.url || avatars[0]?.url || "";
}

function platformLabel(category = "") {
  if (category.includes("ps5")) return "PS5";
  if (category.includes("ps4")) return "PS4";
  if (category.includes("pspc")) return "PC";
  return "Unknown";
}

function normaliseName(value = "") {
  return value.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}

function corsHeaders(origin, configuredOrigin = "") {
  const allowed = configuredOrigin
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const normalisedOrigin = origin.replace(/\/$/, "");
  const allowOrigin =
    allowed.includes("*") || allowed.includes(normalisedOrigin)
      ? normalisedOrigin || "*"
      : allowed[0] || "null";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/npsso|access code/i.test(message)) {
    return "PSN authentication failed. Update the NPSSO secret in Cloudflare.";
  }
  return message.slice(0, 300);
}

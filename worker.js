import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getBasicPresence,
  getProfileFromAccountId,
  getProfileFromUserName,
  getTitleTrophies,
  getUserPlayedGames,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
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

      const trophyMatch = url.pathname.match(
        /^\/api\/player\/([^/]+)\/trophies\/([^/]+)$/,
      );
      const playerMatch = url.pathname.match(/^\/api\/player\/([^/]+)$/);
      if (!trophyMatch && !playerMatch) {
        return json(
          {
            error:
              "Not found. Use GET /api/player/:onlineId or /api/player/:onlineId/trophies/:npCommunicationId.",
          },
          404,
          cors,
        );
      }

      const onlineId = decodeURIComponent((trophyMatch || playerMatch)[1]).trim();
      if (!/^[a-zA-Z0-9_-]{3,16}$/.test(onlineId)) {
        return json({ error: "Invalid PSN online ID." }, 400, cors);
      }

      const npssoOverride = normaliseNpsso(
        request.headers.get("X-NPSSO-Override") || "",
      );
      if (npssoOverride && !/^[A-Za-z0-9_-]{32,256}$/.test(npssoOverride)) {
        return json({ error: "The temporary NPSSO value is invalid." }, 400, cors);
      }
      const legacyOnlineId = (
        request.headers.get("X-PSN-Legacy-ID") || ""
      ).trim();
      if (
        legacyOnlineId &&
        !/^[a-zA-Z0-9_-]{3,16}$/.test(legacyOnlineId)
      ) {
        return json({ error: "The previous PSN online ID is invalid." }, 400, cors);
      }

      const refresh = url.searchParams.get("refresh") === "1";
      if (trophyMatch) {
        const npCommunicationId = decodeURIComponent(trophyMatch[2]).trim();
        if (!/^[A-Za-z0-9_.-]{3,80}$/.test(npCommunicationId)) {
          return json({ error: "Invalid trophy title ID." }, 400, cors);
        }
        const cacheKey = `trophies:v1:${onlineId.toLowerCase()}:${npCommunicationId}`;
        if (!refresh && !npssoOverride) {
          const cached = await env.PSN_CACHE.get(cacheKey, "json");
          if (cached) {
            return json(
              { ...cached, meta: { ...cached.meta, cache: "HIT" } },
              200,
              cors,
            );
          }
        }

        const data = await buildTrophyResponse(
          onlineId,
          npCommunicationId,
          npssoOverride || env.NPSSO,
          legacyOnlineId,
        );
        const ttl = Math.max(60, Number(env.CACHE_TTL_SECONDS) || DEFAULT_TTL);
        if (!npssoOverride) {
          ctx.waitUntil(
            env.PSN_CACHE.put(cacheKey, JSON.stringify(data), {
              expirationTtl: ttl,
            }),
          );
        }
        return json(
          {
            ...data,
            meta: {
              ...data.meta,
              cache: npssoOverride ? "BYPASS" : "MISS",
              ttl: npssoOverride ? null : ttl,
            },
          },
          200,
          cors,
        );
      }

      const cacheKey = `player:v4:${onlineId.toLowerCase()}`;
      if (!refresh && !npssoOverride) {
        const cached = await env.PSN_CACHE.get(cacheKey, "json");
        if (cached) {
          return json({ ...cached, meta: { ...cached.meta, cache: "HIT" } }, 200, cors);
        }
      }

      const data = await buildPlayerResponse(
        onlineId,
        npssoOverride || env.NPSSO,
        legacyOnlineId,
      );
      const ttl = Math.max(60, Number(env.CACHE_TTL_SECONDS) || DEFAULT_TTL);
      if (!npssoOverride) {
        ctx.waitUntil(
          env.PSN_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: ttl }),
        );
      }

      return json(
        {
          ...data,
          meta: {
            ...data.meta,
            cache: npssoOverride ? "BYPASS" : "MISS",
            ttl: npssoOverride ? null : ttl,
          },
        },
        200,
        cors,
      );
    } catch (error) {
      const message = safeErrorMessage(error);
      const status = /not found|privacy|private|does not belong/i.test(message)
        ? 404
        : 502;
      return json({ error: message }, status, cors);
    }
  },
};

async function buildPlayerResponse(onlineId, npsso, legacyOnlineId = "") {
  if (!npsso) {
    throw new Error("The NPSSO Worker secret is missing.");
  }

  const accessCode = await exchangeNpssoForAccessCode(npsso);
  const auth = await exchangeAccessCodeForAuthTokens(accessCode);
  const authorization = { accessToken: auth.accessToken };
  const accountId = await resolveAccountId(
    authorization,
    onlineId,
    legacyOnlineId,
  );

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
      platform: platformLabel(
        game.category,
        game.titleId,
        game.concept?.titleIds,
      ),
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
    trophyTitles: trophyTitles.map(mapTrophyTitle),
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

async function buildTrophyResponse(
  onlineId,
  npCommunicationId,
  npsso,
  legacyOnlineId = "",
) {
  if (!npsso) {
    throw new Error("The NPSSO Worker secret is missing.");
  }

  const accessCode = await exchangeNpssoForAccessCode(npsso);
  const auth = await exchangeAccessCodeForAuthTokens(accessCode);
  const authorization = { accessToken: auth.accessToken };
  const accountId = await resolveAccountId(
    authorization,
    onlineId,
    legacyOnlineId,
  );
  const titles = await getAllTrophyTitles(authorization, accountId);
  const title = titles.find(
    (item) => item.npCommunicationId === npCommunicationId,
  );
  if (!title) {
    throw new Error("This trophy set is private or unavailable.");
  }

  const options = {
    limit: 800,
    npServiceName: title.npServiceName || "trophy",
  };
  const [definition, earned] = await Promise.all([
    getTitleTrophies(
      authorization,
      npCommunicationId,
      "all",
      options,
    ),
    getUserTrophiesEarnedForTitle(
      authorization,
      accountId,
      npCommunicationId,
      "all",
      options,
    ),
  ]);
  const earnedById = new Map(
    (earned.trophies || []).map((trophy) => [trophy.trophyId, trophy]),
  );
  const trophies = (definition.trophies || []).map((trophy) => {
    const userTrophy = earnedById.get(trophy.trophyId) || {};
    const concealed = trophy.trophyHidden && !userTrophy.earned;
    return {
      trophyId: trophy.trophyId,
      groupId: trophy.trophyGroupId || "default",
      hidden: Boolean(trophy.trophyHidden),
      type: trophy.trophyType,
      name: concealed ? "Hidden trophy" : trophy.trophyName || "Trophy",
      detail:
        concealed
          ? "Earn this trophy to reveal its details."
          : trophy.trophyDetail || "",
      iconUrl: concealed ? "" : trophy.trophyIconUrl || "",
      earned: Boolean(userTrophy.earned),
      earnedAt: userTrophy.earnedDateTime || null,
      earnedRate: userTrophy.trophyEarnedRate || null,
      rarity: userTrophy.trophyRare ?? null,
      progressTarget: userTrophy.trophyProgressTargetValue || null,
      rewardImageUrl: userTrophy.trophyRewardImageUrl || "",
      rewardName: userTrophy.trophyRewardName || "",
    };
  });

  return {
    player: { accountId, onlineId },
    title: mapTrophyTitle(title),
    trophies,
    meta: {
      fetchedAt: new Date().toISOString(),
      totalItemCount: trophies.length,
      hasTrophyGroups: Boolean(definition.hasTrophyGroups),
    },
  };
}

function mapTrophyTitle(title) {
  return {
    npCommunicationId: title.npCommunicationId,
    name: title.trophyTitleName,
    iconUrl: title.trophyTitleIconUrl || "",
    platform: platformLabelFromValue(title.trophyTitlePlatform),
    service: title.npServiceName,
    progress: Number(title.progress || 0),
    earned: title.earnedTrophies || {},
    defined: title.definedTrophies || {},
    hasGroups: Boolean(title.hasTrophyGroups),
    lastUpdatedAt: title.lastUpdatedDateTime || null,
  };
}

async function resolveAccountId(authorization, onlineId, legacyOnlineId = "") {
  const directAccountId = await lookupAccountId(authorization, onlineId);
  if (directAccountId) return directAccountId;

  if (legacyOnlineId) {
    const legacyAccountId = await lookupAccountId(
      authorization,
      legacyOnlineId,
    );
    if (legacyAccountId) {
      const profile = await getProfileFromAccountId(
        authorization,
        legacyAccountId,
      );
      if (profile.onlineId?.toLowerCase() === onlineId.toLowerCase()) {
        return legacyAccountId;
      }
      throw new Error(
        `The previous PSN ID “${legacyOnlineId}” does not belong to “${onlineId}”.`,
      );
    }
  }

  throw new Error(`No PSN account was found for “${onlineId}”.`);
}

async function lookupAccountId(authorization, onlineId) {
  try {
    const legacyResponse = await getProfileFromUserName(
      authorization,
      onlineId,
    );
    const legacyProfile = legacyResponse.profile;
    if (legacyProfile?.accountId) {
      return legacyProfile.accountId;
    }
  } catch {
    // Fall through to Sony's universal account search.
  }

  let response;
  try {
    response = await makeUniversalSearch(
      authorization,
      onlineId,
      "SocialAllAccounts",
    );
  } catch {
    return "";
  }
  const results = response.domainResponses?.flatMap((domain) => domain.results || []) || [];
  const exact = results.find(
    (result) =>
      result.socialMetadata?.onlineId?.toLowerCase() === onlineId.toLowerCase(),
  );
  return exact?.socialMetadata?.accountId || "";
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
    platform: platformLabelFromValue(game.launchPlatform || game.format),
    iconUrl: game.conceptIconUrl || game.npTitleIconUrl || "",
  }));

  return {
    online,
    status: online ? (currentGames.length ? "playing" : "online") : "offline",
    platform: platformLabelFromValue(
      platformInfo.platform || presence.platform,
    ),
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

export function platformLabel(category = "", titleId = "", conceptTitleIds = []) {
  if (category.includes("ps5")) return "PS5";
  if (category.includes("ps4")) return "PS4";
  if (category.includes("pspc")) return "PC";
  const ids = [titleId, ...(conceptTitleIds || [])]
    .map((value) => String(value).toUpperCase())
    .filter(Boolean);
  if (ids.some((id) => id.startsWith("PPSA"))) return "PS5";
  if (ids.some((id) => id.startsWith("CUSA"))) return "PS4";
  if (ids.some((id) => /^PCS[A-Z]/.test(id))) return "PS Vita";
  if (ids.some((id) => /^(NPUH|NPEG|NPJH|NPZH|UL[EUJS])/.test(id))) {
    return "PSP";
  }
  if (
    ids.some((id) =>
      /^(NPUB|NPEB|NPJB|NPJA|NPHB|BLUS|BLES|BLJM|BLJS|BCUS|BCES|BCJS|BCKS)/.test(
        id,
      ),
    )
  ) {
    return "PS4 / PS5";
  }
  return "PS4 / PS5";
}

function platformLabelFromValue(value = "") {
  const platform = String(value).trim();
  if (!platform) return null;
  const lower = platform.toLowerCase();
  if (lower.includes("ps5")) return "PS5";
  if (lower.includes("ps4")) return "PS4";
  if (lower.includes("ps3")) return "PS3";
  if (lower.includes("vita")) return "PS Vita";
  if (lower.includes("pc")) return "PC";
  return platform.toUpperCase();
}

function normaliseName(value = "") {
  return value.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}

function normaliseNpsso(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.npsso === "string") return parsed.npsso.trim();
  } catch {
    // The request may contain only the raw cookie value.
  }
  return trimmed
    .replace(/^npsso=/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
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
    "access-control-allow-headers":
      "Content-Type, X-NPSSO-Override, X-PSN-Legacy-ID",
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
    return "PSN authentication failed. The configured or temporary NPSSO value may be expired.";
  }
  return message.slice(0, 300);
}

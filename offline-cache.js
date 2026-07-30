const DATABASE_NAME = "np-track-offline";
const DATABASE_VERSION = 1;
const PROFILE_STORE = "profiles";
export const IMAGE_CACHE_NAME = "np-track-images-v1";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROFILE_STORE)) {
        database.createObjectStore(PROFILE_STORE, { keyPath: "onlineId" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

export async function saveProfileSnapshot(data) {
  if (!data?.player?.onlineId || !("indexedDB" in globalThis)) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROFILE_STORE, "readwrite");
    transaction.objectStore(PROFILE_STORE).put({
      onlineId: data.player.onlineId.toLowerCase(),
      savedAt: new Date().toISOString(),
      data,
    });
    await completeTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function getProfileSnapshot(onlineId) {
  if (!onlineId || !("indexedDB" in globalThis)) return null;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROFILE_STORE, "readonly");
    const completed = completeTransaction(transaction);
    const request = transaction
      .objectStore(PROFILE_STORE)
      .get(onlineId.toLowerCase());
    const result = await new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result || null));
      request.addEventListener("error", () => reject(request.error));
    });
    await completed;
    return result;
  } finally {
    database.close();
  }
}

export async function cacheGameIcons(urls = []) {
  if (!("caches" in globalThis)) return;
  const uniqueUrls = [
    ...new Set(
      urls.filter(
        (url) =>
          typeof url === "string" && /^https:\/\//i.test(url),
      ),
    ),
  ];
  if (!uniqueUrls.length) return;

  const cache = await caches.open(IMAGE_CACHE_NAME);
  for (let index = 0; index < uniqueUrls.length; index += 6) {
    const batch = uniqueUrls.slice(index, index + 6);
    await Promise.allSettled(
      batch.map(async (url) => {
        if (await cache.match(url)) return;
        const response = await fetch(url, {
          mode: "no-cors",
          cache: "force-cache",
        });
        await cache.put(url, response);
      }),
    );
  }
}

export async function clearOfflineCache() {
  if ("indexedDB" in globalThis) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROFILE_STORE, "readwrite");
      transaction.objectStore(PROFILE_STORE).clear();
      await completeTransaction(transaction);
    } finally {
      database.close();
    }
  }
  if ("caches" in globalThis) {
    await caches.delete(IMAGE_CACHE_NAME);
  }
  navigator.serviceWorker?.controller?.postMessage({
    type: "CLEAR_IMAGE_CACHE",
  });
}

import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

/**
 * Persistent storage for a "where should we send the user after the next successful
 * sign-in" hint. This survives a cold start of the app because email verification
 * fires a magic link that relaunches the app from scratch — any in-memory navigation
 * intent would be lost otherwise.
 *
 * The underlying storage is a single-line text file in the app's document directory.
 * A shared in-memory cache is kept in sync so reads on the same boot are synchronous
 * and can survive transient file-system errors.
 *
 * The exported constants and helpers intentionally mirror the shape of the
 * `AsyncStorage` key `pendingReturnTo` referenced in the feature spec.
 */

export const PENDING_RETURN_TO_KEY = 'pendingReturnTo';

const FILE_NAME = `${PENDING_RETURN_TO_KEY}.txt`;

// In-memory cache — sufficient on its own for web, ephemeral for tests.
let cached: string | null = null;
let cacheWarm = false;

function filePath(): string | null {
  if (!documentDirectory) return null;
  return `${documentDirectory}${FILE_NAME}`;
}

/** Remember where to send the user after their next successful sign-in. */
export async function setPendingReturnTo(path: string): Promise<void> {
  cached = path;
  cacheWarm = true;
  const uri = filePath();
  if (!uri) return;
  try {
    await writeAsStringAsync(uri, path);
  } catch {
    // Disk errors are non-fatal — the in-memory cache still works for the
    // common case where the user completes auth without the app being killed.
  }
}

/** Retrieve the pending return path, or null if none is set. */
export async function getPendingReturnTo(): Promise<string | null> {
  if (cacheWarm) return cached;
  const uri = filePath();
  if (!uri) {
    cacheWarm = true;
    return null;
  }
  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) {
      cached = null;
      cacheWarm = true;
      return null;
    }
    const value = await readAsStringAsync(uri);
    cached = value || null;
    cacheWarm = true;
    return cached;
  } catch {
    cached = null;
    cacheWarm = true;
    return null;
  }
}

/** Clear the stored return path. Safe to call when no value is set. */
export async function clearPendingReturnTo(): Promise<void> {
  cached = null;
  cacheWarm = true;
  const uri = filePath();
  if (!uri) return;
  try {
    await deleteAsync(uri, { idempotent: true });
  } catch {
    // Swallow — cache is already cleared.
  }
}

/**
 * Reset the in-memory cache. Intended for use in unit tests so each test
 * starts from a clean state.
 */
export function __resetPendingReturnToCacheForTests(): void {
  cached = null;
  cacheWarm = false;
}

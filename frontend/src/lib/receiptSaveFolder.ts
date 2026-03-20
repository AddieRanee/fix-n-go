const DB_NAME = "fixngo-receipt-storage";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const KEY = "receipt-save-folder";

type DirectoryPicker = (options?: { mode?: "readwrite" | "read" }) => Promise<FileSystemDirectoryHandle>;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredDirectoryHandle() {
  const db = await openDb();
  try {
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function storeDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(handle, KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function ensureDirectoryHandle() {
  let handle = await getStoredDirectoryHandle();
  if (handle) {
    const fsHandle = handle as any;
    const perm = await fsHandle.queryPermission?.({ mode: "readwrite" });
    if (perm === "granted") return handle;

    const requested = await fsHandle.requestPermission?.({ mode: "readwrite" });
    if (requested === "granted") return handle;
  }

  const maybeWindow = window as Window & { showDirectoryPicker?: DirectoryPicker };
  if (typeof maybeWindow.showDirectoryPicker !== "function") {
    throw new Error("Your browser cannot choose a save folder automatically. Please use Chrome or Edge.");
  }

  try {
    handle = await maybeWindow.showDirectoryPicker({ mode: "readwrite" });
    await storeDirectoryHandle(handle);
    return handle;
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "NotAllowedError") {
      return null;
    }
    throw err;
  }
}

export async function saveReceiptPdfToFolder(blob: Blob, suggestedName: string) {
  const handle = await ensureDirectoryHandle();
  if (!handle) return null;

  const fileHandle = await handle.getFileHandle(suggestedName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

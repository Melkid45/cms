import type { BrandPalette } from "@/lib/image-colors";

export interface BrandSettings {
  logo: Blob | null;
  logoName: string | null;
  logoType: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  palette: BrandPalette;
  updatedAt: string;
}

const DATABASE_NAME = "harbstone-cms";
const DATABASE_VERSION = 1;
const STORE_NAME = "project-brand";
const CURRENT_PROJECT_KEY = "current";

interface StoredBrandSettings extends BrandSettings {
  id: typeof CURRENT_PROJECT_KEY;
}

export async function loadBrandSettings(): Promise<BrandSettings | null> {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_PROJECT_KEY);

      request.onsuccess = () => {
        const record = request.result as StoredBrandSettings | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        resolve({
          logo: record.logo,
          logoName: record.logoName,
          logoType: record.logoType,
          logoWidth: record.logoWidth ?? null,
          logoHeight: record.logoHeight ?? null,
          palette: record.palette,
          updatedAt: record.updatedAt,
        });
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read brand settings."));
    });
  } finally {
    database.close();
  }
}

export async function saveBrandSettings(settings: BrandSettings): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const record: StoredBrandSettings = {
        id: CURRENT_PROJECT_KEY,
        ...settings,
      };

      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save brand settings."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving brand settings was aborted."));
    });
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Persistent browser storage is unavailable."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open persistent browser storage."));
    request.onblocked = () => reject(new Error("Brand storage is blocked by another open tab."));
  });
}

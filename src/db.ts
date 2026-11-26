// Learning progress on this device only (spec §8), in IndexedDB.
//   cards    one FSRS card per scene, key = scene id
//   reviews  the full review log (every rating), kept so personal FSRS
//            parameters can be fitted later (spec §5)
// If IndexedDB is unavailable (some private modes), progress is kept in
// memory for this visit only and `persistent` is false.
import type { Card, ReviewLog } from 'ts-fsrs';

export interface CardRecord {
  sceneId: string;
  card: Card;
}

export interface ReviewRecord extends ReviewLog {
  sceneId: string;
}

export interface Store {
  persistent: boolean;
  getCards(): Promise<CardRecord[]>;
  getReviews(): Promise<ReviewRecord[]>;
  /** Saves the card and appends the review in one transaction. */
  saveReview(card: CardRecord, review: ReviewRecord): Promise<void>;
}

const DB_NAME = 'sprechprobe';
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'sceneId' });
      if (!db.objectStoreNames.contains('reviews')) {
        const reviews = db.createObjectStore('reviews', { autoIncrement: true });
        reviews.createIndex('sceneId', 'sceneId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function indexedDbStore(db: IDBDatabase): Store {
  return {
    persistent: true,
    getCards: () => request(db.transaction('cards').objectStore('cards').getAll() as IDBRequest<CardRecord[]>),
    getReviews: () => request(db.transaction('reviews').objectStore('reviews').getAll() as IDBRequest<ReviewRecord[]>),
    saveReview: (card, review) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(['cards', 'reviews'], 'readwrite');
        tx.objectStore('cards').put(card);
        tx.objectStore('reviews').add(review);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  };
}

function memoryStore(): Store {
  const cards = new Map<string, CardRecord>();
  const reviews: ReviewRecord[] = [];
  return {
    persistent: false,
    getCards: async () => [...cards.values()],
    getReviews: async () => [...reviews],
    saveReview: async (card, review) => {
      cards.set(card.sceneId, card);
      reviews.push(review);
    },
  };
}

export async function openStore(): Promise<Store> {
  try {
    const store = indexedDbStore(await openDb());
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.();
    return store;
  } catch (e) {
    console.warn('IndexedDB unavailable, progress will not be saved', e);
    return memoryStore();
  }
}

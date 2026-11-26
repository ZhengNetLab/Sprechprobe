// Everything the app keeps on this device (spec §8), in IndexedDB:
//   cards     one FSRS card per scene, key = scene id
//   reviews   the full review log (every rating), kept so personal FSRS
//             parameters can be fitted later (spec §5)
//   projects  downloaded projects (scenes + audio map); the audio itself is
//             in Cache Storage, see content.ts
//   meta      small values, e.g. the last fetched catalog
// If IndexedDB is unavailable (some private modes), everything is kept in
// memory for this visit only and `persistent` is false.
import type { Card, ReviewLog } from 'ts-fsrs';
import type { ProjectData } from './project.ts';

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
  getProjects(): Promise<ProjectData[]>;
  putProject(project: ProjectData): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  putMeta(key: string, value: unknown): Promise<void>;
}

const DB_NAME = 'sprechprobe';
const DB_VERSION = 2;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Each store is created only if missing, so upgrading from version 1
    // keeps all existing progress.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'sceneId' });
      if (!db.objectStoreNames.contains('reviews')) {
        const reviews = db.createObjectStore('reviews', { autoIncrement: true });
        reviews.createIndex('sceneId', 'sceneId');
      }
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function write(db: IDBDatabase, stores: string[], fn: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    fn(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function indexedDbStore(db: IDBDatabase): Store {
  const all = <T>(store: string): Promise<T[]> =>
    request(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
  return {
    persistent: true,
    getCards: () => all<CardRecord>('cards'),
    getReviews: () => all<ReviewRecord>('reviews'),
    saveReview: (card, review) =>
      write(db, ['cards', 'reviews'], (tx) => {
        tx.objectStore('cards').put(card);
        tx.objectStore('reviews').add(review);
      }),
    getProjects: () => all<ProjectData>('projects'),
    putProject: (project) => write(db, ['projects'], (tx) => tx.objectStore('projects').put(project)),
    deleteProject: (id) => write(db, ['projects'], (tx) => tx.objectStore('projects').delete(id)),
    getMeta: <T>(key: string) => request(db.transaction('meta').objectStore('meta').get(key) as IDBRequest<T | undefined>),
    putMeta: (key, value) => write(db, ['meta'], (tx) => tx.objectStore('meta').put(value, key)),
  };
}

function memoryStore(): Store {
  const cards = new Map<string, CardRecord>();
  const reviews: ReviewRecord[] = [];
  const projects = new Map<string, ProjectData>();
  const meta = new Map<string, unknown>();
  return {
    persistent: false,
    getCards: async () => [...cards.values()],
    getReviews: async () => [...reviews],
    saveReview: async (card, review) => {
      cards.set(card.sceneId, card);
      reviews.push(review);
    },
    getProjects: async () => [...projects.values()],
    putProject: async (p) => void projects.set(p.id, p),
    deleteProject: async (id) => void projects.delete(id),
    getMeta: async <T>(key: string) => meta.get(key) as T | undefined,
    putMeta: async (key, value) => void meta.set(key, value),
  };
}

export async function openStore(): Promise<Store> {
  try {
    const store = indexedDbStore(await openDb());
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.();
    return store;
  } catch (e) {
    console.warn('IndexedDB unavailable, nothing will be saved', e);
    return memoryStore();
  }
}

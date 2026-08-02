// Minimal IndexedDB key-value store shared by index.html and sw.js.
// localStorage isn't readable from a service worker, so location + watchlist
// (needed by sw.js's push handler) live here instead.
(function (root) {
'use strict';

const DB_NAME = 'panchanga-db';
const STORE = 'kv';

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

root.PanchangaIDB = { get: idbGet, set: idbSet };

})(typeof self !== 'undefined' ? self : this);

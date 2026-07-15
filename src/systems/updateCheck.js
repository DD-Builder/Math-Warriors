/**
 * Silent auto-update for the GitHub-Pages build.
 *
 * The running bundle carries its build VERSION (config.js). Each deploy
 * also publishes version.json (generated from package.json). On boot we
 * fetch version.json with caching fully bypassed and compare: if the
 * deployed version is newer than the one we're running, the browser has
 * served a STALE cached shell — so we force one hard reload from a
 * cache-busting URL, which pulls the fresh index.html + hashed assets.
 *
 * A sessionStorage guard means we only auto-reload ONCE per target
 * version, so a wrong version.json (or a CDN mid-propagation) can never
 * cause a reload loop. If we're still stale after that one attempt, we
 * surface it so the title screen can offer a manual "Update" button.
 */

import { VERSION } from '../config.js';

const TRIED_KEY = 'mw_update_target';

export function checkForUpdate() {
  return fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const latest = data && data.version;
      if (!latest || latest === VERSION) {
        return { current: true, running: VERSION, latest: latest || VERSION };
      }
      // We're behind the deployed version.
      let tried = null;
      try { tried = sessionStorage.getItem(TRIED_KEY); } catch (e) { /* ignore */ }
      if (tried !== latest) {
        try { sessionStorage.setItem(TRIED_KEY, latest); } catch (e) { /* ignore */ }
        hardReload(latest);
        return { current: false, reloading: true, running: VERSION, latest };
      }
      // Auto-reload already attempted for this version and still stale —
      // let the UI offer a manual refresh.
      return { current: false, reloading: false, running: VERSION, latest };
    })
    .catch(() => ({ current: true, running: VERSION, latest: VERSION, offline: true }));
}

/** Force a fresh load: drop any Cache Storage, then navigate cache-busted. */
export function hardReload(version) {
  const go = () => {
    const url = location.pathname + '?v=' + encodeURIComponent(version || Date.now());
    location.replace(url);
  };
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(go, go);
      return;
    }
  } catch (e) { /* ignore */ }
  go();
}

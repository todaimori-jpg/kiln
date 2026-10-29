/* Kiln — platform.js : browser integrations that some embeds (sandboxed iframes) disallow.
   Every entry degrades to a no-op or null so the app still runs where the API is blocked. */
(function () {
  'use strict';
  const K = (window.K = window.K || {});
  K.platform = {
    storeGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    storeSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    enterFullscreen(el) { try { if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); } catch (e) {} },
    exitFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} },
    fileDB() { try { return window.indexedDB || null; } catch (e) { return null; } },
  };
})();

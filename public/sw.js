// Intentionally network-only: no private documents, tokens, API responses, or
// media are stored in CacheStorage. The installed app requires a connection.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

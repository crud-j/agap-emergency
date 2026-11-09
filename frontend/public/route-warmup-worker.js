/* AGAP — development route warm-up (Web Worker).
 *
 * `next dev` compiles each page the first time it is opened, which is the 4–5 s
 * pause on a first click. This worker requests the signed-in role's sidebar pages
 * one by one in the background, so they are already compiled when clicked.
 *
 * Only started in development (see components/layout/PerformanceWorkers.tsx).
 * It fetches page HTML only: no API calls, no data, no side effects. Pages render
 * their data on the client after sign-in, never during this request.
 */
self.onmessage = async (event) => {
  const routes = Array.isArray(event.data && event.data.routes) ? event.data.routes : [];
  let warmed = 0;
  for (const route of routes) {
    // Same-origin paths only.
    if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) continue;
    try {
      // One at a time: the dev compiler handles a queue better than a burst.
      const res = await fetch(route, { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) warmed += 1;
    } catch {
      // Dev server restarting or offline: skip; the page still compiles on click.
    }
  }
  self.postMessage({ warmed, total: routes.length });
  self.close();
};

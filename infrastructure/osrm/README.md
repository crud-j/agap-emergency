# Self-hosted OSRM routing (MOD-43, plan §13.1 Phase 5)

AGAP's ETA job and transport routes use an OSRM-compatible router (`OsrmRoutingProvider`,
`MAP_ROUTER=osrm`). In development the backend uses the public demo server
`http://router.project-osrm.org`, which has no SLA and fair-use limits only. Production should
use this self-hosted router: zero per-call cost, and it keeps working on-premises when external
internet is degraded during typhoons.

The router uses the Geofabrik `philippines-latest.osm.pbf` extract with the OSRM `car` profile
and the MLD algorithm. It respects OSM one-ways and access tags. It does **not** know about
floods or temporary closures: crews keep the Waze / Google Maps hand-off, and every ETA is shown
as an estimate.

## Build (once, then monthly)

Needs Docker, about 2 GB of disk and several GB of free RAM for `osrm-extract`.

```bash
infrastructure/osrm/build.sh                 # download + extract + partition + customize
infrastructure/osrm/build.sh --no-download   # rebuild from the .pbf already in data/
```

The output goes to `infrastructure/osrm/data/` (git-ignored). The image is pinned to
`ghcr.io/project-osrm/osrm-backend:v5.27.1` in both `build.sh` and `docker-compose.yml`. Change
both together, and rebuild the data after an image upgrade (the data format can change between
versions).

## Run

The service is behind the `routing` compose profile, so a normal `docker compose up -d` does not
start it:

```bash
docker compose --profile routing up -d osrm
```

It serves `osrm-routed` on port 5000 inside the Docker network (`http://osrm:5000`). For a
backend running on the host it is also bound to `127.0.0.1:5005` only (not exposed beyond this
machine). Point the backend at it in `.env`:

```bash
MAP_ROUTER=osrm
MAP_PROVIDER_ROUTING_URL=http://osrm:5000        # backend in docker compose
# MAP_PROVIDER_ROUTING_URL=http://127.0.0.1:5005 # backend on the host (pnpm start:dev)
```

Check it with a route to the reference hospital (Bocaue town hall → DOH — Joni Villanueva General
Hospital); the last coordinate should be about `[120.9436, 14.7968]`:

```bash
curl "http://127.0.0.1:5005/route/v1/driving/120.9466,14.7980;120.94358,14.79679?overview=full&geometries=geojson"
```

## Monthly refresh

```bash
infrastructure/osrm/refresh.sh
```

It builds into `data.next/` while the running service keeps serving, then swaps the folders and
restarts the service. On a failed build, nothing changes. The previous build stays in
`data.previous/` until the next refresh, so a bad extract can be rolled back by swapping the
folders back and running `docker compose --profile routing up -d --force-recreate osrm`.
Schedule it on the routing host, for example with cron: `0 3 1 * * /path/to/agap/infrastructure/osrm/refresh.sh`.

## Failure behaviour

If the router is down, the backend keeps the last good route as `stale` for up to 120 s, then
shows none. The ETA becomes unknown, and transport start, arrival and dispatch still work
(Reliability Rules). Crews can always hand off to Waze or Google Maps.

## Acceptance (plan Phase 5)

The target is p95 < 300 ms for the route request above. It is not measured yet; measure it on the
production routing host after the first build.

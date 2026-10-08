/**
 * DI tokens for the swappable map capability strategies. Each is resolved by the
 * MapsModule factory based on the `MAP_PROVIDER` env var (and per-capability
 * overrides), so feature code only ever depends on {@link MapsService}.
 */
export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');
export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');
export const TILE_PROVIDER = Symbol('TILE_PROVIDER');

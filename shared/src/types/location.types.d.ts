export interface GeoPoint {
    lat: number;
    lng: number;
    accuracy?: number;
    altitude?: number;
}
export interface LocationContext {
    address: string | null;
    barangay: string | null;
    city: string | null;
    province: string | null;
    region: string | null;
    postalCode: string | null;
    country: string;
}
//# sourceMappingURL=location.types.d.ts.map
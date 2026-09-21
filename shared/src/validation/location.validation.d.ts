import { z } from 'zod';
export declare const GeoPointSchema: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    accuracy: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    lat: number;
    lng: number;
    accuracy?: number | undefined;
}, {
    lat: number;
    lng: number;
    accuracy?: number | undefined;
}>;
export type GeoPointInput = z.infer<typeof GeoPointSchema>;
//# sourceMappingURL=location.validation.d.ts.map
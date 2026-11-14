/**
 * Risk Map point colours, one per incident category (MOD-51). FLOOD appears as a point
 * only when it falls outside every barangay boundary; inside, floods shade the barangay.
 */
export const RISK_POINT_CATEGORIES = [
  'FIRE', 'INDUSTRIAL', 'ROAD_ACCIDENT', 'MEDICAL', 'RESCUE', 'DEBRIS', 'NATURAL_DISASTER', 'FLOOD', 'OTHER',
] as const;

export const RISK_CATEGORY_COLORS: Record<string, string> = {
  FIRE: '#DC2626',
  INDUSTRIAL: '#7C3AED',
  ROAD_ACCIDENT: '#D97706',
  MEDICAL: '#DB2777',
  RESCUE: '#0D9488',
  DEBRIS: '#78716C',
  NATURAL_DISASTER: '#4F46E5',
  FLOOD: '#0284C7',
  OTHER: '#64748B',
};

export const riskCategoryColor = (category: string): string => RISK_CATEGORY_COLORS[category] ?? RISK_CATEGORY_COLORS.OTHER!;

/** Barangay shading by flood reports: none, then light to dark blue. */
export const FLOOD_SHADES = ['#BFDBFE', '#60A5FA', '#1D4ED8'] as const;

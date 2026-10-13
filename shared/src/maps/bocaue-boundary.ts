export const BOCAUE_BOUNDARY_SOURCE =
  'geoBoundaries PHL-ADM3-30758251 (2020; CC BY 3.0 IGO): https://github.com/wmgeolab/geoBoundaries/blob/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/PHL/ADM3/geoBoundaries-PHL-ADM3_simplified.geojson';

export const BOCAUE_BOUNDARY: readonly (readonly [number, number])[] = [
  [120.90566397600003, 14.784231372000022],
  [120.90817908500003, 14.775878571000021],
  [120.91370266600006, 14.771165616000076],
  [120.91512261800005, 14.766244732000075],
  [120.92218369700004, 14.763330215000053],
  [120.92292795000003, 14.768621436000046],
  [120.9276353460001, 14.769586968000056],
  [120.92777955100007, 14.773167284000067],
  [120.92985045600005, 14.774669500000073],
  [120.93454729900009, 14.770485730000075],
  [120.94261488400002, 14.776025538000056],
  [120.94268404000002, 14.777583553000056],
  [120.94798616800006, 14.777481412000043],
  [120.95080868100001, 14.779496058000063],
  [120.952618529, 14.778523083000039],
  [120.95836431200007, 14.780278360000068],
  [120.96119559300007, 14.78531177900004],
  [120.96073982900009, 14.788136916000042],
  [120.95776366100006, 14.788395430000037],
  [120.95822229700002, 14.791552827000032],
  [120.95500217000006, 14.79807558400006],
  [120.95336839000004, 14.797442458000035],
  [120.95284603800008, 14.799163361000069],
  [120.94860310600006, 14.799550546000035],
  [120.94816379400004, 14.803602965000039],
  [120.94596822200003, 14.803124102000027],
  [120.94518835200006, 14.812121801000046],
  [120.94125789300006, 14.81335565300003],
  [120.94068501400011, 14.815349919000028],
  [120.9442033360001, 14.816967293000062],
  [120.94289467500005, 14.82439690800004],
  [120.9441893610001, 14.823310010000057],
  [120.946506397, 14.826022700000067],
  [120.94924062300004, 14.826305795000053],
  [120.9500112500001, 14.83481732100006],
  [120.948678201, 14.837369030000048],
  [120.95055853000008, 14.840005620000056],
  [120.95096273900003, 14.844527219000042],
  [120.94342544200003, 14.844527914000025],
  [120.94174489800002, 14.838560124000026],
  [120.92719888300007, 14.830164997000054],
  [120.92862315500008, 14.82958798900006],
  [120.92746045800004, 14.827038997000045],
  [120.93003974600003, 14.825290199000051],
  [120.9300059090001, 14.823832505000041],
  [120.92112655200003, 14.816996747000076],
  [120.91590380100001, 14.807730114000037],
  [120.91357235400005, 14.808098620000067],
  [120.90954220200001, 14.803348921000065],
  [120.91042896500005, 14.796296279000046],
  [120.91488784800003, 14.786957160000043],
  [120.90833842500001, 14.787464261000025],
  [120.91022606600006, 14.784057045000054],
  [120.90566397600003, 14.784231372000022],
];

export const BOCAUE_BOUNDARY_BOUNDS = {
  south: 14.763330215000053,
  west: 120.90566397600003,
  north: 14.844527914000025,
  east: 120.96119559300007,
} as const;

function isPointOnSegment(
  longitude: number,
  latitude: number,
  [x1, y1]: readonly [number, number],
  [x2, y2]: readonly [number, number],
): boolean {
  const cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-10) return false;
  return (
    longitude >= Math.min(x1, x2) - 1e-10 &&
    longitude <= Math.max(x1, x2) + 1e-10 &&
    latitude >= Math.min(y1, y2) - 1e-10 &&
    latitude <= Math.max(y1, y2) + 1e-10
  );
}

export function isCoordinateInBocaue(latitude: number, longitude: number): boolean {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < BOCAUE_BOUNDARY_BOUNDS.south ||
    latitude > BOCAUE_BOUNDARY_BOUNDS.north ||
    longitude < BOCAUE_BOUNDARY_BOUNDS.west ||
    longitude > BOCAUE_BOUNDARY_BOUNDS.east
  ) {
    return false;
  }

  let inside = false;
  for (let current = 0, previous = BOCAUE_BOUNDARY.length - 1; current < BOCAUE_BOUNDARY.length; previous = current++) {
    const currentPoint = BOCAUE_BOUNDARY[current];
    const previousPoint = BOCAUE_BOUNDARY[previous];
    if (!currentPoint || !previousPoint) continue;

    const [currentLongitude, currentLatitude] = currentPoint;

    if (isPointOnSegment(longitude, latitude, previousPoint, [currentLongitude, currentLatitude])) {
      return true;
    }

    const crossesLatitude =
      currentLatitude > latitude !== previousPoint[1] > latitude;
    if (
      crossesLatitude &&
      longitude <
        ((previousPoint[0] - currentLongitude) * (latitude - currentLatitude)) /
          (previousPoint[1] - currentLatitude) +
          currentLongitude
    ) {
      inside = !inside;
    }
  }
  return inside;
}

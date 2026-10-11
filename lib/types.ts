export type Pandal = {
  id: string; name: string; name_bn?: string; zone: string;
  lat: number; lng: number; area?: string; theme?: string; verified: boolean;
  /** "approx" = the coordinate is shared with other pandals, so it is a placeholder, not a real pin. */
  precision?: "exact" | "approx";
};
export type Place = {
  id: string; name: string; type: "food" | "sight";
  lat: number; lng: number; note: string; verified: boolean;
};
export type Route = { id: string; name: string; blurb: string; ids: string[]; km: number; zone?: string; start?: Point };
export type Point = { lat: number; lng: number };

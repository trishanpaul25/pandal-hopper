export type Pandal = {
  id: string; name: string; name_bn?: string; zone: string;
  lat: number; lng: number; area?: string; theme?: string; verified: boolean;
};
export type Place = {
  id: string; name: string; type: "food" | "sight";
  lat: number; lng: number; note: string; verified: boolean;
};
export type Route = { id: string; name: string; blurb: string; ids: string[]; km: number };
export type Point = { lat: number; lng: number };

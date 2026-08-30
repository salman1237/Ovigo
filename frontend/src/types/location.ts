export type LocationType = "country" | "region" | "city" | "attraction";

export interface Location {
  id: string;
  name: string;
  slug: string;
  type: LocationType;
  parent_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_publishable: boolean;
}

export interface LocationNode extends Location {
  children: LocationNode[];
}

export interface LocationTag {
  id: string;
  entity_type: string;
  entity_id: string;
  location: Location;
}

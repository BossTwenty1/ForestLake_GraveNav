import { landmarkName, type PlanningBundle } from "./phase2-planning";
import type { PhaseTwoGeography } from "./phase2-geographic";
import type { PublicGisFeature } from "./supabase/gis-types";

export type ParkCategory = "gardens" | "landmarks" | "pathways";
export type ParkPlace = {
  id: string;
  name: string;
  category: ParkCategory;
  kind: "Garden" | "Section" | "Landmark" | "Pathway";
  points: [number, number][];
  geographic?: PublicGisFeature;
};

export function planningPlaces(bundle: PlanningBundle): ParkPlace[] {
  const places = new Map<string, ParkPlace>();
  function add(name: string, kind: ParkPlace["kind"], category: ParkCategory, point: [number, number]) {
    const id = kind + ":" + name;
    const place = places.get(id);
    if (place) place.points.push(point);
    else places.set(id, { id, name, kind, category, points: [point] });
  }
  for (const place of bundle.places.landmarks) {
    if (place.kind === "garden") add(place.name, "Garden", "gardens", place.cadXY);
    else add(landmarkName(place.name), "Landmark", "landmarks", place.cadXY);
  }
  for (const label of bundle.details.labels) {
    if (label.kind === "section") add("Section " + label.name, "Section", "gardens", label.cadXY);
    if (label.kind === "amenity" && label.name === "Walkway") add(label.name, "Pathway", "pathways", label.cadXY);
    else if (label.kind === "amenity") add(label.name, "Landmark", "landmarks", label.cadXY);
  }
  return [...places.values()];
}

export function publishedPlaces(data: PhaseTwoGeography): ParkPlace[] {
  const feature = (value: PublicGisFeature, name: string, kind: ParkPlace["kind"], category: ParkCategory): ParkPlace => ({
    id: category + ":" + value.id, name, kind, category, points: [], geographic: value,
  });
  const area = data.layers.boundaries.find(value => value.properties.kind === "area");
  const paths = data.layers.walkways.filter(value => value.properties.walkingAllowed === true);
  return [
    ...(area ? [feature(area, "Published park area", "Section", "gardens")] : []),
    ...data.layers.landmarks.flatMap(value => {
      const label = value.properties.label;
      return typeof label === "string" && label.trim() ? [feature(value, label.trim(), "Landmark", "landmarks")] : [];
    }),
    ...paths.map((path, index) => feature(path, paths.length === 1 ? "Park pathway" : "Park pathway " + (index + 1), "Pathway", "pathways")),
  ];
}

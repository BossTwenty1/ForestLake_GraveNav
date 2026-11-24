import { unstable_cache } from "next/cache";
import { getPublicGardenNames } from "./public-data";

const readCachedGardens = unstable_cache(
  async () => getPublicGardenNames(),
  ["gravenav-public-garden-names"],
  { revalidate: 3600 },
);

export async function getCachedPublicGardenNames(): Promise<string[]> {
  return readCachedGardens();
}

import { redirect } from "next/navigation";
import { getPublicBurialRecord, getPublicBurialRecordByPlot } from "@/lib/supabase/public-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NavigationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = getParam(params.id);
  const plot = getParam(params.plot);
  const record = id ? await getPublicBurialRecord(id) : await getPublicBurialRecordByPlot(plot);

  if (!record) {
    if (!id && plot) redirect("/results?" + new URLSearchParams({ query: plot }));
    redirect("/record-not-found?" + new URLSearchParams({ query: id || "that gravesite" }));
  }

  redirect("/map?id=" + encodeURIComponent(record.id));
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

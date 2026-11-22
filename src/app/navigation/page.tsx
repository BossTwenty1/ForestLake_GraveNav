import { safeResultsReturnTo } from "@/lib/visitor-presentation";
import { redirect } from "next/navigation";
import { getPublicBurialRecord, getPublicBurialRecordByPlot } from "@/lib/supabase/public-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NavigationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = getParam(params.id);
  const plot = getParam(params.plot);
  const originalReturn = getParam(params.returnTo);
  const returnTo = safeResultsReturnTo(originalReturn);
  const record = id ? await getPublicBurialRecord(id) : await getPublicBurialRecordByPlot(plot);

  if (!record) {
    if (!id && plot) redirect("/results?" + new URLSearchParams({ query: plot }));
    redirect("/record-not-found?" + new URLSearchParams({ returnTo }));
  }

  redirect("/map?" + new URLSearchParams({ id: record.id, ...(originalReturn ? { returnTo } : {}) }));
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

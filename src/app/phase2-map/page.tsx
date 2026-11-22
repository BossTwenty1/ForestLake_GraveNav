import { redirect } from "next/navigation";

export default async function PhaseTwoMapPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : "";
  redirect("/map?" + new URLSearchParams({ view: "geographic", ...(id ? { id } : {}) }));
}

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { PublicSearchForm } from "@/components/visitor/public-search-form";
import { VisitorAnnouncementBanner } from "@/components/visitor/visitor-announcement-banner";
import { getCachedPublicGardenNames } from "@/lib/supabase/cached-public-data";
import { getCachedPublicSiteSettings } from "@/lib/supabase/site-settings";
import { MemorialSearchHelp, MemorialSearchShell } from "./memorial-search-shell";
import styles from "./memorial-search.module.css";
import { readSearchParams, resultsHref } from "./search-params";

export const dynamic = "force-dynamic";

const tips: { icon: IconName; title: string; text: string }[] = [
  { icon: "userSearch", title: "By full name", text: "Enter a first or last name. Partial names can help if you are unsure of the spelling." },
  { icon: "location", title: "By plot identifier", text: "Enter the plot reference as it appears in your cemetery records." },
  { icon: "sliders", title: "By garden or year", text: "Narrow matches by garden section or by the year of passing." },
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = readSearchParams(await searchParams);
  const [gardens, siteSettings] = await Promise.all([
    getCachedPublicGardenNames().catch(() => null),
    getCachedPublicSiteSettings(),
  ]);

  return (
    <MemorialSearchShell initial>
      <VisitorAnnouncementBanner settings={siteSettings} />
      <header className={styles.heading}>
        <p className={styles.directory}><span>Public Directory</span> · {siteSettings.parkName}</p>
        <h1>Search Memorials</h1>
        <p>Find a loved one’s memorial record by name or plot reference.</p>
      </header>
      <PublicSearchForm state={state} gardens={gardens ?? []} gardenListUnavailable={gardens === null} />
      <section className={styles.welcome} aria-labelledby="search-welcome">
        <div className={styles.welcomeIcon}><Icon name="tree" size={34} /></div>
        <h2 id="search-welcome">Find a Loved One</h2>
        <p>Enter a name or plot reference above to begin searching memorial records at {siteSettings.parkName}.</p>
        <ul className={styles.tips}>{tips.map(tip => <li key={tip.title}>
          <Icon name={tip.icon} size={19} /><div><strong>{tip.title}</strong><p>{tip.text}</p></div>
        </li>)}</ul>
        {gardens?.length ? <nav className={styles.quickSections} aria-label="Quick garden searches">
          <span>Quick section searches</span>
          {gardens.slice(0, 3).map(garden => <Link key={garden} href={resultsHref(state, { section: garden, page: 1 })}>{garden}</Link>)}
        </nav> : null}
        <p className={styles.privacy}><Icon name="shield" size={17} />Only public memorial records appear in search.</p>
      </section>
      <MemorialSearchHelp />
    </MemorialSearchShell>
  );
}

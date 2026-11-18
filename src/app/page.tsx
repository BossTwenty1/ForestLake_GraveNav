import { HeroVisitorVideo } from "@/components/visitor/hero-visitor-video";
import Link from "next/link";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { getPublicGardenNames } from "@/lib/supabase/public-data";

export default async function HomePage() {
  const gardenNames = (await getPublicGardenNames()).slice(0, 3);

  return <VisitorShell wide><div className="visitor-home">
    <section className="stitch-hero">
      <div className="stitch-hero__copy">
        <h1>Find resting places <span>with dignity &amp; grace</span></h1>
        <p>Find a loved one’s memorial, view their recorded plot details, and explore Forest Lake Memorial Park.</p>
      </div>
      <HeroVisitorVideo />
    </section>

    <section className="stitch-search-card" id="visitor-search">
      <form action="/results" className="visitor-search-form" method="get">
        <Input autoComplete="off" enterKeyHint="search" label="Locate a loved one's resting plot" name="query" placeholder="Enter deceased's first or last name…" icon="search" />
        <Button className="button--full" icon="search" size="lg" type="submit">Find a memorial</Button>
      </form>
      {gardenNames.length ? <div className="quick-filters"><span>Quick:</span>{gardenNames.map((garden) => <Link href={`/results?section=${encodeURIComponent(garden)}`} key={garden}>{garden}</Link>)}</div> : null}
    </section>

    <section className="stitch-explore">
      <div className="stitch-section-heading">
        <h2>Explore Memorial Park</h2>
        <Link href="/map">View park map</Link>
      </div>
      <div className="stitch-feature-track">
        <Link className="stitch-feature-card stitch-feature-card--map" href="/map">
          <span className="stitch-feature-visual"><Icon name="map" size={34} /><b>Forest Lake · Phase 2</b></span>
          <span><strong>Explore the park</strong><small>Find gardens, parking areas, pathways, and park amenities.</small></span>
          <span className="stitch-feature-footer"><b>Park map</b><span>Open map <Icon name="chevronRight" size={13} /></span></span>
        </Link>
        <article className="stitch-feature-card stitch-feature-card--verification">
          <span className="stitch-feature-icon"><Icon name="verification" size={18} /></span>
          <span><small>Plan your visit</small><strong>Find a loved one</strong><p>Search by name, check the memorial details, and view available gravesite information.</p></span>
          <Link href="/search">Search records</Link>
        </article>
      </div>
    </section>

    <section className="stitch-how-it-works">
      <h2>How GraveNav works</h2>
      <ol>
        <li><span>1</span><div><strong>Search by name or plot number</strong><p>Enter the details you know to find matching memorial records.</p></div></li>
        <li><span>2</span><div><strong>Confirm the memorial record</strong><p>Review the matching name, dates, section, and plot before continuing.</p></div></li>
        <li><span>3</span><div><strong>Open the park map</strong><p>Find nearby landmarks and check whether walking directions are available for the gravesite.</p></div></li>
      </ol>
    </section>

    <footer className="visitor-footer"><strong>GraveNav Albay</strong><p>Forest Lake Memorial Park, Bogtong, Legazpi City, Albay</p></footer>
  </div></VisitorShell>;
}

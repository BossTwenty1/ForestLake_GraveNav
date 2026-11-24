import { existsSync } from "node:fs";
import path from "node:path";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Icon, type IconName } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { HeroBackgroundVideo } from "@/components/visitor/hero-background-video";
import { HeroVisitorVideo } from "@/components/visitor/hero-visitor-video";
import { HomepageParkMap } from "@/components/visitor/homepage-park-map";
import { SearchSubmitButton } from "@/components/visitor/search-submit-button";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { getCachedPublicGardenNames } from "@/lib/supabase/cached-public-data";
import { getCachedPublicSiteSettings } from "@/lib/supabase/site-settings";
import styles from "./homepage.module.css";

const landscape = "/phase2-viewer/landscape/";

export default async function HomePage() {
  await connection();
  const [gardenNamesRaw, siteSettings] = await Promise.all([
    getCachedPublicGardenNames().catch(() => []),
    getCachedPublicSiteSettings(),
  ]);
  const gardenNames = gardenNamesRaw.slice(0, 3);
  const parkName = siteSettings.parkName;
  const parkAddress = siteSettings.parkAddress;
  const contactParts = [siteSettings.officePhone, siteSettings.officeEmail].filter(Boolean);
  const contactNote = contactParts.length
    ? contactParts.join(" · ")
    : "Memorial records and gravesite assistance";

  const information: { icon: IconName; label: string; title: string; body: string; note: string }[] = [
    {
      icon: "location",
      label: "Directions & hours",
      title: "Park Location & Hours",
      body: siteSettings.operatingHours || "Explore the park layout before your visit.",
      note: parkAddress,
    },
    {
      icon: "support",
      label: "Staff guidance",
      title: "On-Site Staff Assistance",
      body: "Ask cemetery staff for help finding a gravesite or checking a memorial record in person.",
      note: contactNote,
    },
    {
      icon: "tree",
      label: "Grounds courtesy",
      title: "Dignified Environment",
      body: siteSettings.visitorGuidelines || "Keep pathways clear and respect families taking time for quiet remembrance.",
      note: "Courtesy on park grounds",
    },
  ];

  const hasParkPreview = ["base.png", "roads.png", "paths.png", "trees.png"].every((file) =>
    existsSync(path.join(process.cwd(), "public", landscape, file)));

  return (
    <VisitorShell batchOne wide className={styles.shell} helpHref="#visitor-information" searchInputId="homepage-query" siteSettings={siteSettings}>
      <section className={styles.hero} aria-label={`${parkName} memorial search`}>
        <HeroBackgroundVideo
          className={styles.heroVideo}
          src="/homepage/park-hero-showcase-web.mp4"
        />
        <div className={styles.context}>
          <div className={styles.container}>
            <span className={styles.contextPark}><i aria-hidden="true" /> {parkName}</span>
            <span className={styles.contextAddress}><Icon name="location" size={15} />{parkAddress}</span>
          </div>
        </div>
        <div className={styles.container}>
          <div className={styles.heroCopy}>
            <p className={styles.parkLabel}><Icon name="location" size={15} />{parkName}</p>
            <h1>Find a Loved One’s <span className={styles.heroTitleAccent}>Resting Place</span></h1>
            <p className={styles.intro}>Search memorial records, discover gravesite information, and explore {parkName} with care.</p>
            <Form action="/results" className={styles.searchCard} role="search" aria-label="Memorial search">
              <label className={styles.searchLabel} htmlFor="homepage-query"><span className={styles.mobileSearchLabel}>Name or plot identifier</span><span className={styles.desktopSearchLabel}>Search by deceased name or plot reference</span></label>
              <div className={styles.searchRow}>
                <Input id="homepage-query" autoComplete="off" enterKeyHint="search" maxLength={160} name="query"
                  placeholder="Enter a name or plot reference" type="search" icon="search" aria-describedby="homepage-search-hint" />
                <SearchSubmitButton label="Search Memorials" />
              </div>
              <p id="homepage-search-hint" className={styles.searchHint}><Icon name="info" size={17} />Search by first name, last name, or known plot code.</p>
            </Form>
          </div>
          <ul className={styles.quickFacts}>
            <li>
              <span className={styles.quickFactIcon} aria-hidden="true"><Icon name="memorial" size={22} /></span>
              <span className={styles.quickFactText}><strong>Memorials</strong><span>Search by name or plot</span></span>
            </li>
            <li>
              <span className={styles.quickFactIcon} aria-hidden="true"><Icon name="clock" size={22} /></span>
              <span className={styles.quickFactText}><strong>Visiting hours</strong><span>{siteSettings.operatingHours || parkAddress}</span></span>
            </li>
            <li>
              <span className={styles.quickFactIcon} aria-hidden="true"><Icon name="map" size={22} /></span>
              <span className={styles.quickFactText}><strong>Park map</strong><span>Gardens and pathways</span></span>
            </li>
          </ul>
          <figure className={styles.parkPhoto}>
            <div className={styles.landscape} role="img" aria-label={`Entrance of ${parkName}`}>
              <div className={styles.landscapeTitle} aria-hidden="true">
                <span>Memorial grounds</span><strong>A Place for Remembrance</strong>
              </div>
            </div>
            <figcaption className={styles.parkCaption}>
              <span className={styles.captionIcon}><Icon name="tree" size={21} /></span>
              <span><strong>{parkName}</strong><small>{parkAddress}</small></span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.explore} aria-labelledby="explore-title">
        <div className={styles.container}>
          <div className={styles.exploreHeading}>
            <div>
              <p className={styles.sectionLabel}><Icon name="map" size={16} />Grounds &amp; Facilities Orientation</p>
              <h2 id="explore-title"><span className={styles.mobileIcon}><Icon name="location" size={19} /></span>Explore the Memorial Park</h2>
              <p>Discover the park layout, garden sections, pathways, and available landmarks before visiting in person.</p>
            </div>
            <Link href="/map" className={styles.desktopMapAction}>Explore Park Map <Icon name="navigation" size={18} /></Link>
          </div>
          <HomepageParkMap gardenNames={gardenNames} hasParkPreview={hasParkPreview} />
          <Link href="/map" className={styles.mobileMapAction}><Icon name="navigation" size={18} />Explore Park Map</Link>
        </div>
      </section>

      <section className={styles.tutorial} aria-labelledby="tutorial-title">
        <div className={styles.container}>
          <p className={styles.sectionLabel}><Icon name="eye" size={15} />Video Tutorial</p>
          <h2 id="tutorial-title"><span className={styles.mobileIcon}><Icon name="eye" size={19} /></span>A Simple Guide to GraveNav</h2>
          <p>Learn how to find memorial records and explore gravesite information.</p>
          <div className={styles.tutorialPlayer}>
            <HeroVisitorVideo />
            <p className={styles.lightVideoCaption}>Find memorial records and check available gravesite information.</p>
            <div className={styles.darkVideoCaption}>
              <Icon name="eye" size={18} />
              <span><strong>How to locate a plot with GraveNav</strong><small>Search by name or plot reference</small></span>
            </div>
          </div>
        </div>
      </section>

      <section id="visitor-information" className={styles.information} aria-label="Visitor information">
        <div className={styles.container}>
          <div className={styles.informationHeading}>
            <p className={styles.sectionLabel}>Visitor Guidance</p>
            <h2><span className={styles.lightInfoTitle}>Visitor Orientation &amp; Support</span><span className={styles.darkInfoTitle}>Essential Visitor Information</span></h2>
          </div>
          <div className={styles.infoCards}>
            {information.map(({ icon, label, title, body, note }) => <article key={title}>
              <span className={styles.infoIcon}><Icon name={icon} size={20} /></span>
              <p className={styles.legendLabel}>{label}</p>
              <h3>{title}</h3><p>{body}</p>
              <p className={styles.infoNote}>{note}</p>
            </article>)}
          </div>
          <div className={styles.mobileHelp}>
            <span className={styles.infoIcon}><Icon name="help" size={20} /></span>
            <div><h3>Visiting {parkName}?</h3>
              <p>{contactParts.length ? `Contact cemetery staff at ${contactParts.join(" or ")} for help checking a memorial record or locating a gravesite.` : "Ask cemetery staff on site for help checking a memorial record or locating a gravesite."}</p>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}><div className={styles.container}>
        <p><strong>GraveNav Albay</strong> · {parkName}, {parkAddress}{contactParts.length ? ` · ${contactParts.join(" · ")}` : ""}</p>
      </div></footer>
    </VisitorShell>
  );
}

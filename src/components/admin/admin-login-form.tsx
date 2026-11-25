"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { localSupabaseConfig, getBrowserSupabase } from "@/lib/supabase/config";
import { Alert } from "@/components/ui/alert";
import { Icon, type IconName } from "@/components/ui/icons";
import { getAuthFlowType, restoreSessionFromAuthUrl } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./admin-login.module.css";

const FEATURES: { icon: IconName; line1: string; line2: string }[] = [
  { icon: "reports", line1: "Cemetery", line2: "Analytics" },
  { icon: "layers", line1: "Plot", line2: "Management" },
  { icon: "photos", line1: "Photo", line2: "Moderation" },
  { icon: "records", line1: "Reports", line2: "& Audits" },
];

function initialMessageFor(code?: string): { title: string; copy: string; variant: "danger" | "info" | "success" } {
  if (code === "config") {
    return {
      title: "Authentication not configured",
      copy: "Supabase environment variables are missing for this deployment.",
      variant: "danger",
    };
  }
  if (code === "auth_callback") {
    return {
      title: "Sign-in link expired",
      copy: "Please sign in below or request a new password reset email.",
      variant: "info",
    };
  }
  return { title: "", copy: "", variant: "info" };
}

function LeafGraphic({ tone = "#78a932" }: { tone?: string }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 36 36" width="100%" height="100%">
      <path
        d="M6 28C8 14 18 6 31 5C30 18 22 28 8 30C7 30 6 29 6 28Z"
        fill={tone}
      />
      <path
        d="M8 28C14 21 21 14 29 7"
        stroke="#4f7c1f"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function AdminLoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const pageRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [message, setMessage] = useState<{ title: string; copy: string; variant: "danger" | "info" | "success" }>(
    () => initialMessageFor(initialError),
  );

  // Preserve existing auth invite/recovery session restoration flow.
  useEffect(() => {
    const flowType = getAuthFlowType();
    if (flowType !== "invite" && flowType !== "recovery" && flowType !== "password_setup") return;

    let active = true;
    void (async () => {
      if (active && (await restoreSessionFromAuthUrl())) router.replace("/auth/set-password");
    })();
    return () => {
      active = false;
    };
  }, [router]);

  // Pause ambient animations when the tab is hidden to save battery/CPU.
  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Animation D — Subtle restrained pointer parallax on desktop fine pointers only.
  useEffect(() => {
    const el = pageRef.current;
    if (!el || typeof window === "undefined") return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduced) return;

    let rafId = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const nx = (event.clientX / window.innerWidth - 0.5) * -10;
        const ny = (event.clientY / window.innerHeight - 0.5) * -8;
        el.style.setProperty("--px", `${nx.toFixed(1)}px`);
        el.style.setProperty("--py", `${ny.toFixed(1)}px`);
      });
    };

    const onPointerLeave = () => {
      el.style.setProperty("--px", "0px");
      el.style.setProperty("--py", "0px");
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage({ title: "", copy: "", variant: "info" });
    setEmailError("");
    setPasswordError("");

    const client = getBrowserSupabase();
    if (!client) {
      setMessage({
        title: "Authentication unavailable",
        copy: "Authentication service configuration is missing for this environment.",
        variant: "info",
      });
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Enter a valid administrator email address.");
      return;
    }

    if (mode === "reset") {
      setBusy(true);
      try {
        const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;
        const { error } = await client.auth.resetPasswordForEmail(trimmedEmail, { redirectTo });
        if (error) {
          setMessage({
            title: "Reset unavailable",
            copy: "A password reset email could not be sent right now. Try again shortly.",
            variant: "danger",
          });
          return;
        }
        setMessage({
          title: "Check your email",
          copy: "If an active staff account exists for that email, a password reset link has been sent.",
          variant: "success",
        });
      } catch {
        setMessage({
          title: "Reset unavailable",
          copy: "The authentication service could not be reached. Please try again shortly.",
          variant: "danger",
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!password) {
      setPasswordError("Enter your password to continue.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await client.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
        setMessage({
          title: "Unable to sign in",
          copy: "The email or password was not accepted, or the authentication service is unavailable.",
          variant: "danger",
        });
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setMessage({
        title: "Unable to sign in",
        copy: "The email or password was not accepted, or the authentication service is unavailable.",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className={`${styles.page} ${pageHidden ? styles.pagePaused : ""}`}
      id="main-content"
      ref={pageRef}
    >
      <a className="skip-link" href="#admin-login-form">
        Skip to sign in
      </a>

      {/* Desktop Top-Right Theme Toggle */}
      <div className={styles.themeCorner}>
        <ThemeToggle compact />
      </div>

      {/* Scenic Backdrop — Supplied Cemetery Photo + Organic Veil + Ambient Sun + Leaves + Bottom Waves */}
      <div aria-hidden="true" className={styles.scenicBackdrop}>
        <div className={styles.scenicPhotoWrap}>
          <Image
            alt=""
            className={styles.scenicPhoto}
            fill
            priority
            sizes="(max-width: 820px) 100vw, 66vw"
            src="/admin/login-scenery.jpg"
          />
          {/* Organic SVG atmospheric veil merging the photo cleanly into the canvas */}
          <svg
            className={styles.scenicVeilSvg}
            preserveAspectRatio="none"
            viewBox="0 0 1000 800"
          >
            <defs>
              <filter height="180%" id="scenicSoftBlur" width="180%" x="-40%" y="-40%">
                <feGaussianBlur stdDeviation="56" />
              </filter>
            </defs>
            <g filter="url(#scenicSoftBlur)">
              <path
                d="M310 120 C430 140 540 90 660 -60 L1140 -60 L1140 880 L235 880 C340 660 220 350 310 120 Z"
                fill="var(--login-bg)"
                opacity="0.96"
              />
              <rect fill="var(--login-bg)" height="960" width="260" x="860" y="-80" />
            </g>
          </svg>
        </div>

        {/* Subtle pale-green organic curve on far right behind card */}
        <svg className={styles.rightAccentShape} preserveAspectRatio="none" viewBox="0 0 420 900">
          <path
            d="M420 190 C310 340 315 560 155 720 L420 720 Z"
            fill="var(--login-wave-back)"
            opacity="0.46"
          />
        </svg>

        {/* Animation C — Soft Ambient Sunlight Rays */}
        <div className={styles.sunlightLayer}>
          <svg className={styles.sunlightSvg} viewBox="0 0 600 600">
            <defs>
              <filter height="160%" id="sunBlur" width="160%" x="-30%" y="-30%">
                <feGaussianBlur stdDeviation="24" />
              </filter>
            </defs>
            <circle cx="112" cy="118" fill="#fff8d6" filter="url(#sunBlur)" opacity="0.72" r="74" />
            <polygon
              fill="#fff9dd"
              filter="url(#sunBlur)"
              opacity="0.34"
              points="102,115 152,102 420,415 290,468"
            />
            <polygon
              fill="#f3de2c"
              filter="url(#sunBlur)"
              opacity="0.16"
              points="115,126 146,118 320,515 225,535"
            />
          </svg>
        </div>

        {/* Animation B — Gently Falling Botanical Leaves (kept to scenic left/center area) */}
        <div className={styles.leavesLayer}>
          <span className={`${styles.leaf} ${styles.leaf1}`}>
            <LeafGraphic tone="#7eab2c" />
          </span>
          <span className={`${styles.leaf} ${styles.leaf2}`}>
            <LeafGraphic tone="#90ba3a" />
          </span>
          <span className={`${styles.leaf} ${styles.leaf3}`}>
            <LeafGraphic tone="#6d9c28" />
          </span>
          <span className={`${styles.leaf} ${styles.leaf4}`}>
            <LeafGraphic tone="#a1c649" />
          </span>
          <span className={`${styles.leaf} ${styles.leaf5}`}>
            <LeafGraphic tone="#7ca631" />
          </span>
        </div>

        {/* Animation L — Flowing Green Landscape Waves at Bottom */}
        <div className={styles.bottomWaves}>
          <svg
            className={styles.bottomWavesSvg}
            preserveAspectRatio="none"
            viewBox="0 0 1440 200"
          >
            <path
              d="M0 154 C210 74 440 96 680 140 C930 185 1170 98 1440 36 L1440 200 L0 200 Z"
              fill="var(--login-wave-back)"
            />
            <path
              d="M0 188 C175 110 380 120 620 166 C870 214 1150 112 1440 52 L1440 200 L0 200 Z"
              fill="var(--login-wave-mid)"
            />
            <path
              d="M0 198 C210 132 420 145 680 184 C960 220 1210 132 1440 84 L1440 200 L0 200 Z"
              fill="var(--login-wave-front)"
            />
          </svg>
        </div>
      </div>

      {/* Mobile Header & Scenic Banner (<= 820px only) */}
      <header className={styles.mobileHeader}>
        <div className={styles.mobileTopbar}>
          <Link aria-label="Back to GraveNav home" className={styles.brandHeader} href="/">
            <span className={styles.brandMark}>
              <Image alt="" height={38} src="/forest-lake-logo.png" width={38} />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>GraveNav</span>
              <span className={styles.brandSub}>Cemetery Management</span>
            </span>
          </Link>
          <ThemeToggle compact />
        </div>

        <div className={styles.mobileBanner}>
          <Image alt="" className={styles.mobileBannerImg} fill sizes="100vw" src="/admin/login-scenery.jpg" />
          <div aria-hidden="true" className={styles.mobileBannerOverlay} />
          <div className={styles.mobileBannerText}>
            <p className={styles.mobileHeadline}>
              Cemetery Management <span className={styles.mobileHighlight}>Dashboard</span>
            </p>
            <p className={styles.mobileBannerSub}>
              Manage memorial records, cemetery plots, photos, and visitor site settings in one place.
            </p>
          </div>
        </div>
      </header>

      {/* Main Two-Column Desktop Composition */}
      <div className={styles.stage}>
        {/* Left Side — GraveNav Branding & Scenic Presentation */}
        <section aria-label="GraveNav Cemetery Management overview" className={styles.brandColumn}>
          <Link aria-label="Back to GraveNav home" className={styles.brandHeader} href="/">
            <span className={styles.brandMark}>
              <Image alt="" height={40} src="/forest-lake-logo.png" width={40} />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>GraveNav</span>
              <span className={styles.brandSub}>Cemetery Management</span>
            </span>
          </Link>

          <p className={styles.heroHeadline}>
            <span className={styles.headlineLine1}>Cemetery</span>
            <span className={styles.headlineLine2}>Management</span>
            <span className={styles.headlineLine3}>Dashboard</span>
          </p>

          <p className={styles.heroCopy}>
            Manage memorial records, cemetery plots, photos, and visitor site settings in one place.
          </p>

          <ul aria-label="Platform capabilities" className={styles.featureList} role="list">
            {FEATURES.map((item) => (
              <li className={styles.featureItem} key={item.line1}>
                <span aria-hidden="true" className={styles.featureIconBox}>
                  <Icon name={item.icon} size={23} strokeWidth={1.85} />
                </span>
                <span className={styles.featureLabel}>
                  {item.line1}
                  <br />
                  {item.line2}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Right Side — Administrator Authentication Card */}
        <section aria-labelledby="admin-login-heading" className={styles.cardColumn}>
          <div className={styles.authCard}>
            <div className={styles.badgeRow}>
              <span className={styles.protectedBadge}>
                <Icon name="shield" size={14} />
                <span>Protected workspace</span>
              </span>
              <span className={styles.envBadge}>{localSupabaseConfig.environmentLabel}</span>
            </div>

            <div className={styles.cardIntro}>
              <span aria-hidden="true" className={styles.shieldEmblem}>
                <Icon name="shield" size={32} strokeWidth={2} />
              </span>
              <h1 className={styles.cardTitle} id="admin-login-heading">
                {mode === "reset" ? "Reset Staff Password" : "Administrator Sign In"}
              </h1>
              <p className={styles.cardSubtitle}>
                {mode === "reset"
                  ? "Enter your staff email to receive a secure password recovery link."
                  : "Access the GraveNav Cemetery Management System."}
              </p>
            </div>

            <form className={styles.form} id="admin-login-form" noValidate onSubmit={submit}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="admin-login-email">
                  <span aria-hidden="true" className={styles.fieldLabelIcon}>
                    <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="16">
                      <rect height="14" rx="2" width="18" x="3" y="5" />
                      <path d="m4 7 8 6 8-6" />
                    </svg>
                  </span>
                  <span>Email address</span>
                </label>
                <div className={styles.inputWrap}>
                  <input
                    aria-describedby={emailError ? "admin-login-email-error" : undefined}
                    aria-invalid={Boolean(emailError)}
                    autoComplete="username"
                    className={`${styles.textInput} ${emailError ? styles.textInputInvalid : ""}`}
                    disabled={busy}
                    id="admin-login-email"
                    name="email"
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (emailError) setEmailError("");
                    }}
                    placeholder="staff@forestlake.ph"
                    required
                    type="email"
                    value={email}
                  />
                </div>
                {emailError ? (
                  <p className={styles.fieldError} id="admin-login-email-error" role="alert">
                    {emailError}
                  </p>
                ) : null}
              </div>

              {mode === "signin" ? (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="admin-login-password">
                    <span aria-hidden="true" className={styles.fieldLabelIcon}>
                      <Icon name="lock" size={16} />
                    </span>
                    <span>Password</span>
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      aria-describedby={passwordError ? "admin-login-password-error" : undefined}
                      aria-invalid={Boolean(passwordError)}
                      autoComplete="current-password"
                      className={`${styles.textInput} ${styles.textInputPassword} ${passwordError ? styles.textInputInvalid : ""}`}
                      disabled={busy}
                      id="admin-login-password"
                      name="password"
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (passwordError) setPasswordError("");
                      }}
                      placeholder="Enter password"
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className={styles.passwordToggle}
                      disabled={busy}
                      onClick={() => setShowPassword((prev) => !prev)}
                      type="button"
                    >
                      {showPassword ? (
                        <Icon name="eye" size={18} />
                      ) : (
                        <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="18">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C6 19 2.5 12 2.5 12a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6 0 9.5 8 9.5 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="m2 2 20 20" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {passwordError ? (
                    <p className={styles.fieldError} id="admin-login-password-error" role="alert">
                      {passwordError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button className={styles.submitButton} disabled={busy} type="submit">
                {busy ? (
                  <>
                    <span aria-hidden="true" className={styles.spinner} />
                    <span>{mode === "reset" ? "Sending reset link..." : "Signing in..."}</span>
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" viewBox="0 0 24 24" width="18">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <path d="M10 17l5-5-5-5" />
                      <path d="M15 12H3" />
                    </svg>
                    <span>{mode === "reset" ? "Send Password Reset Email" : "Sign In"}</span>
                  </>
                )}
              </button>

              <div className={styles.forgotRow}>
                <button
                  className={styles.forgotLink}
                  disabled={busy}
                  onClick={() => {
                    setMessage({ title: "", copy: "", variant: "info" });
                    setEmailError("");
                    setPasswordError("");
                    setMode((current) => (current === "signin" ? "reset" : "signin"));
                  }}
                  type="button"
                >
                  {mode === "signin" ? "Forgot password?" : "Back to sign in"}
                </button>
              </div>

              {message.copy ? (
                <Alert
                  icon={message.variant === "danger" ? "alert" : message.variant === "success" ? "check" : "info"}
                  title={message.title}
                  variant={message.variant}
                >
                  {message.copy}
                </Alert>
              ) : null}
            </form>

            <div className={styles.cardFooter}>
              <span aria-hidden="true" className={styles.footerIcon}>
                <Icon name="users" size={19} />
              </span>
              <p className={styles.footerText}>
                Visitor search remains available without an account. Staff accounts are managed by cemetery
                administrators.
              </p>
            </div>

            {!localSupabaseConfig.configured ? (
              <p className={styles.configNote}>
                Authentication environment variables are not configured for this local server.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

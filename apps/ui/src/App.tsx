import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { api } from "./lib/api";
import { cx } from "./components/ui";
import { RunBuilderPage } from "./pages/RunBuilder";
import { RunPage } from "./pages/Run";

const StudioPage = lazy(() => import("./pages/Studio"));
const VerifyDeskPage = lazy(() => import("./pages/VerifyDesk"));
const WalletPage = lazy(() => import("./pages/Wallet"));
const ResultsPage = lazy(() => import("./pages/Results"));
const CapabilitiesPage = lazy(() => import("./pages/Capabilities"));
const TrafficPage = lazy(() => import("./pages/Traffic"));
const PartiesPage = lazy(() => import("./pages/Parties"));

const NAV = [
  { to: "/", label: "Run" },
  { to: "/studio", label: "Issuer Studio" },
  { to: "/verify", label: "Verifier desk" },
  { to: "/wallet", label: "Wallet" },
  { to: "/parties", label: "Parties" },
  { to: "/results", label: "Results" },
  { to: "/capabilities", label: "Capabilities" },
  { to: "/traffic", label: "Live traffic" },
];

function Wordmark() {
  return (
    <NavLink
      to="/"
      className="flex shrink-0 items-center gap-3 rounded-lg"
      aria-label="Inji Interop Playground, home"
    >
      <svg width="46" height="18" viewBox="0 0 46 18" aria-hidden>
        <path d="M6 9h17" stroke="var(--issue-bright)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M23 9h17" stroke="var(--present)" strokeWidth="4.5" strokeLinecap="round" />
        {[6, 23, 40].map((cx) => (
          <circle
            key={cx}
            cx={cx}
            cy="9"
            r="5.5"
            fill="var(--surface)"
            stroke="var(--issue)"
            strokeWidth="3"
          />
        ))}
      </svg>
      <span className="text-[1.0625rem] leading-none font-extrabold tracking-wide text-issue">
        INJI <span className="font-medium text-ink">Interop Playground</span>
      </span>
    </NavLink>
  );
}

function SystemStatus() {
  const q = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 15_000 });
  const s = q.data;
  const dot = (ok?: boolean) => (
    <span
      className={cx(
        "inline-block size-2 rounded-full",
        ok === undefined ? "bg-muted" : ok ? "bg-pass" : "bg-fail",
      )}
      aria-hidden
    />
  );
  return (
    <div className="flex items-center gap-3 text-xs font-medium text-muted" aria-live="polite">
      <span className="flex items-center gap-1.5" title="Inji Certify 0.14.0">
        {dot(s?.services.certify)} Certify
      </span>
      <span className="flex items-center gap-1.5" title="Inji Verify 0.18.2">
        {dot(s?.services.verify)} Verify
      </span>
      {s?.hosted.map((h) => (
        <NavLink
          key={h.id}
          to="/parties#hosted"
          className="hidden items-center gap-1.5 sm:flex"
          title={`${h.name}: ${h.issuers} issuers, ${h.types} credential types${h.reachable ? "" : " (not reachable)"}`}
        >
          {dot(h.reachable)} {h.name.replace(/^MOSIP /, "")}
        </NavLink>
      ))}
      {s && s.parties.configured > 0 && (
        <NavLink
          to="/parties"
          className="hidden items-center gap-1.5 sm:flex"
          title={`${s.parties.reachable} of ${s.parties.configured} external parties reachable`}
        >
          {dot(s.parties.reachable === s.parties.configured)} External {s.parties.reachable}/
          {s.parties.configured}
        </NavLink>
      )}
      {s && (
        <span className="hidden rounded-full bg-surface px-2.5 py-0.5 md:inline" title={s.publicBaseUrl}>
          {s.mode === "public" ? "Public URL: phones can connect" : "Local only"}
        </span>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem("theme");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try {
      if (theme) localStorage.setItem("theme", theme);
      else localStorage.removeItem("theme");
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  const dark = theme === "dark";
  return (
    <button
      className="inline-flex size-9 items-center justify-center rounded-full border border-hairline text-issue transition-colors duration-150 hover:border-issue hover:bg-issue-soft"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
    </button>
  );
}

const LINKS = [
  { href: "https://docs.inji.io", label: "Inji docs" },
  { href: "https://community.mosip.io", label: "Community" },
  { href: "https://github.com/inji", label: "GitHub" },
];

export function App() {
  const loc = useLocation();
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [loc.pathname]);
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="border-b border-hairline bg-sunken/70">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-1.5 sm:px-6">
          <SystemStatus />
          <ul className="hidden items-center gap-5 text-xs font-semibold md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-ink transition-colors duration-150 hover:text-issue"
                >
                  {l.label} <ArrowUpRight size={13} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-hairline bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-1 px-4 pt-3 sm:px-6 lg:flex-nowrap lg:py-3">
          <Wordmark />
          <nav
            aria-label="Main"
            className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:overflow-visible lg:px-0"
          >
            <ul className="flex gap-1 lg:justify-center">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.to === "/"}
                    className={({ isActive }) =>
                      cx(
                        "relative block px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:transition-colors after:duration-150 lg:py-2",
                        isActive
                          ? "text-issue after:bg-present"
                          : "text-ink/75 after:bg-transparent hover:text-issue hover:after:bg-hairline",
                      )
                    }
                  >
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto lg:ml-0">
            <ThemeToggle />
          </div>
        </div>
      </header>
      {/* At least a screen tall, so the footer starts below the fold and content arriving never shoves it around. */}
      <div className="relative">
        <div
          aria-hidden
          className="waves pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-transparent!"
        />
        <div
          aria-hidden
          className="orbit pointer-events-none absolute top-6 right-[max(2rem,calc((100%-1320px)/2+2rem))] hidden w-[4.5rem] lg:block"
        />
        <main
          id="main"
          tabIndex={-1}
          className="relative mx-auto min-h-svh max-w-[1320px] px-4 py-8 outline-none sm:px-6 sm:py-12"
        >
          <Suspense fallback={<p className="text-muted">Loading…</p>}>
            <Routes>
              <Route path="/" element={<RunBuilderPage />} />
              <Route path="/runs/:id" element={<RunPage />} />
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/verify" element={<VerifyDeskPage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/parties" element={<PartiesPage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/capabilities" element={<CapabilitiesPage />} />
              <Route path="/traffic" element={<TrafficPage />} />
              <Route path="*" element={<p>This page does not exist. Use the navigation above.</p>} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <footer className="mx-auto flex max-w-[1320px] flex-col gap-1 border-t border-hairline px-4 pt-4 pb-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
        <p>
          <strong className="font-bold text-ink">Use synthetic data only.</strong> Never enter a real person's
          details, even to try something out.
        </p>
        <p>Inji Interoperability Playground, open source under MPL-2.0.</p>
      </footer>
    </div>
  );
}

import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
    <NavLink to="/" className="flex items-center gap-2.5 rounded" aria-label="Inji Interop Playground, home">
      <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden>
        <path d="M5 7h15" stroke="var(--issue)" strokeWidth="4" strokeLinecap="round" />
        <path d="M20 7h15" stroke="var(--present)" strokeWidth="4" strokeLinecap="round" />
        {[5, 20, 35].map((cx) => (
          <circle key={cx} cx={cx} cy="7" r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.5" />
        ))}
      </svg>
      <span className="text-[1.05rem] leading-none font-black tracking-tight">
        Inji Interop <span className="font-medium">Playground</span>
      </span>
    </NavLink>
  );
}

function SystemStatus() {
  const q = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 15_000 });
  const s = q.data;
  const dot = (ok?: boolean) => <span className={cx("inline-block size-2 rounded-full", ok === undefined ? "bg-muted" : ok ? "bg-pass" : "bg-fail")} aria-hidden />;
  return (
    <div className="flex items-center gap-3 text-sm text-muted" aria-live="polite">
      <span className="flex items-center gap-1.5" title="Inji Certify 0.14.0">
        {dot(s?.services.certify)} Certify
      </span>
      <span className="flex items-center gap-1.5" title="Inji Verify 0.18.2">
        {dot(s?.services.verify)} Verify
      </span>
      {s && s.parties.configured > 0 && (
        <NavLink to="/parties" className="hidden items-center gap-1.5 sm:flex" title={`${s.parties.reachable} of ${s.parties.configured} external parties reachable`}>
          {dot(s.parties.reachable === s.parties.configured)} External {s.parties.reachable}/{s.parties.configured}
        </NavLink>
      )}
      {s && (
        <span className="hidden rounded bg-sunken px-2 py-0.5 md:inline" title={s.publicBaseUrl}>
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
  const dark = theme === "dark" || (!theme && matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button className="rounded-md border border-hairline px-2.5 py-1 text-sm font-bold hover:border-ink" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      {dark ? "Light" : "Dark"}
    </button>
  );
}

export function App() {
  const loc = useLocation();
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [loc.pathname]);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-3">
            <SystemStatus />
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-[1320px] overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1 pt-2">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) => cx("block border-b-[3px] px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors duration-150", isActive ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1320px] px-4 py-6 outline-none sm:px-6 sm:py-8">
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
      <footer className="mx-auto flex max-w-[1320px] flex-col gap-1 border-t border-hairline px-4 pt-4 pb-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
        <p>
          <strong className="font-bold text-ink">Use synthetic data only.</strong> Never enter a real person's details, even to try something out.
        </p>
        <p>Inji Interoperability Playground, open source under MPL-2.0.</p>
      </footer>
    </div>
  );
}

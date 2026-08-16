"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PenSquare,
  MessagesSquare,
  Settings,
  CircleHelp,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { logout } from "@/lib/auth-actions";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/articles/new", label: "New Article", icon: PenSquare },
  { href: "/admin/comments", label: "Comments", icon: MessagesSquare },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

// Matches SiteHeader's collapsible-search two-stage mount/open pattern (Module 6):
// mount immediately, slide in on the next tick; slide out immediately, unmount after
// the transition finishes so the drawer never lingers in the layout (or over the next
// page) once closed.
const TRANSITION_MS = 300;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// Shared between the desktop sidebar and the mobile drawer so the active-state accent,
// spring easing, and hover treatment can't drift between the two — one definition, two
// places it's rendered.
function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <div className="flex flex-1 flex-col gap-sm">
      {NAV_ITEMS.map(({ href, label, icon: ItemIcon }) => {
        const isActive = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center gap-sm rounded-lg px-sm py-sm font-ui-label-md text-admin-ui-label-md transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary ${
              isActive
                ? "scale-[0.98] font-bold text-admin-primary before:absolute before:left-[-24px] before:h-6 before:w-1 before:rounded-r-full before:bg-admin-primary"
                : "text-admin-on-surface-variant hover:bg-admin-surface-container-low hover:text-admin-primary"
            }`}
          >
            <ItemIcon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function SupportAndLogout() {
  return (
    <div className="mt-auto flex flex-col gap-sm border-t border-admin-outline-variant pt-lg">
      <span
        className="flex cursor-not-allowed items-center gap-sm rounded-lg px-sm py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant opacity-50"
        title="Not built yet"
      >
        <CircleHelp className="h-5 w-5" />
        Support
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="flex w-full items-center gap-sm rounded-lg px-sm py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant transition-colors duration-200 hover:bg-admin-surface-container-low hover:text-admin-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary"
        >
          <LogOut className="h-5 w-5" />
          Log Out
        </button>
      </form>
    </div>
  );
}

export default function AdminShell({
  children,
  adminName,
  fullHeight = false,
}: {
  children: React.ReactNode;
  adminName: string;
  /** Use for screens that manage their own internal scroll (e.g. the editor's split pane). */
  fullHeight?: boolean;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Closes the drawer when the route actually changes — covers a nav-link tap
  // (client-side navigation completing) without needing a per-link onClick handler,
  // and also catches back/forward navigation while the drawer happens to be open.
  // This is react.dev's own documented "adjusting state when a value changes during
  // render" pattern, not a `useEffect(() => { setOpen(false) }, [pathname])` — that
  // shape trips `react-hooks/set-state-in-effect` (setState called synchronously in
  // an effect body), a rule this project has hit and solved several times already
  // (Modules 3, 5, 7, 9 — see DEVIATIONS.md) by restructuring so the effect body
  // itself never needs a direct setState call. React batches these calls and
  // re-renders before committing, so the drawer never visibly flashes open on the
  // new page.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
    setMounted(false);
  }

  function openDrawer() {
    setMounted(true);
    window.setTimeout(() => setOpen(true), 10);
  }

  function closeDrawer() {
    setOpen(false);
    window.setTimeout(() => setMounted(false), TRANSITION_MS);
  }

  // Close on Escape, same as SiteHeader's search overlay.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        closeDrawer();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      // flex-col is load-bearing, not cosmetic: below md, the sticky mobile <nav> and
      // the content wrapper below it are the only two IN-FLOW children here (both
      // <aside> elements are `fixed`, removed from flow entirely) — without flex-col,
      // the default flex-row direction lays them out side by side instead of stacked,
      // and since neither has `min-w-0`, each shrinks to its own content's minimum
      // intrinsic width rather than the nav taking full width with content below it.
      // Found live while verifying an unrelated feature at 375px: the mobile nav bar
      // measured ~217px wide (its own min-content floor) with page content squeezed
      // into whatever was left, on every admin page tested (Dashboard, Comments, the
      // article editor) — not specific to any one screen. At md+, <nav> is `md:hidden`
      // (display:none, removed from flow), leaving only the content wrapper as the
      // sole in-flow child, so direction doesn't matter there either way.
      className={`flex flex-col bg-admin-background text-admin-on-background ${
        fullHeight ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      <nav className="md:hidden sticky top-0 z-50 flex w-full items-center justify-between border-b border-admin-outline-variant bg-admin-surface px-md py-sm">
        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open navigation menu"
            aria-expanded={open}
            className="rounded-lg p-1 text-admin-primary transition-colors hover:bg-admin-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-headline-md text-admin-headline-md text-admin-primary tracking-tight">
            The Editorial
          </span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-admin-outline-variant bg-admin-surface-container-high font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
          {initials(adminName)}
        </div>
      </nav>

      {mounted && (
        <>
          <div
            onClick={closeDrawer}
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-admin-scrim/50 transition-opacity duration-300 ease-in-out md:hidden ${
              open ? "opacity-100" : "opacity-0"
            }`}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className={`fixed left-0 top-0 z-[60] flex h-full w-64 flex-col border-r border-admin-outline-variant bg-admin-surface px-md py-lg shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] md:hidden ${
              open ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="mb-lg flex items-center justify-between gap-md">
              <div className="flex items-center gap-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-admin-outline-variant bg-admin-surface-container-high font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
                  {initials(adminName)}
                </div>
                <div>
                  <h1 className="font-headline-md text-admin-headline-md text-admin-primary tracking-tight">
                    The Editorial
                  </h1>
                  <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
                    Newsletter Console
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close navigation menu"
                className="rounded-lg p-1 text-admin-on-surface-variant transition-colors hover:bg-admin-surface-container-low hover:text-admin-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <NavLinks pathname={pathname} />
            <SupportAndLogout />
          </aside>
        </>
      )}

      <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-admin-outline-variant bg-admin-surface px-md py-lg md:flex">
        <div className="mb-lg flex items-center gap-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-admin-outline-variant bg-admin-surface-container-high font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
            {initials(adminName)}
          </div>
          <div>
            <h1 className="font-headline-md text-admin-headline-md text-admin-primary tracking-tight">
              The Editorial
            </h1>
            <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
              Newsletter Console
            </p>
          </div>
        </div>

        <NavLinks pathname={pathname} />
        <SupportAndLogout />
      </aside>

      {/* No `w-full` here — that's not decorative, it was the actual bug. `w-full` sets
          an explicit width:100%, which bypasses flexbox's default align-items:stretch
          (the parent has no other in-flow sibling at md+ — <nav> is md:hidden there —
          so stretch is what should size this). Explicit 100% + md:ml-64's 256px margin
          summed to a 1696px margin-box in a 1440px viewport, confirmed live via
          document.documentElement.scrollWidth (1696) vs clientWidth (1440) — exactly
          the sidebar's own width. Leaving width unset (auto) lets stretch correctly
          compute calc(100% - margin) on its own, at every width, with no explicit
          arithmetic needed. */}
      <div className={`flex flex-col md:ml-64 ${fullHeight ? "h-full overflow-hidden" : ""}`}>
        {children}
      </div>
    </div>
  );
}

"use client";

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
} from "lucide-react";
import { logout } from "@/lib/auth-actions";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/articles/new", label: "New Article", icon: PenSquare },
  { href: "/admin/comments", label: "Comments", icon: MessagesSquare },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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

  return (
    <div
      className={`flex bg-admin-background text-admin-on-background ${
        fullHeight ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      <nav className="md:hidden sticky top-0 z-50 flex w-full items-center justify-between border-b border-admin-outline-variant bg-admin-surface px-md py-sm">
        <div className="flex items-center gap-sm">
          <Menu className="h-5 w-5 text-admin-primary" />
          <span className="font-headline-md text-admin-headline-md text-admin-primary tracking-tight">
            The Editorial
          </span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-admin-outline-variant bg-admin-surface-container-high font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
          {initials(adminName)}
        </div>
      </nav>

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
      </aside>

      <div className={`flex w-full flex-col md:ml-64 ${fullHeight ? "h-full overflow-hidden" : ""}`}>
        {children}
      </div>
    </div>
  );
}

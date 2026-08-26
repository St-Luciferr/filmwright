"use client";

import {
  Activity,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match this href only, not its descendants. Needed for "/". */
  exact?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/library", label: "Library", icon: FolderOpen },
  { href: "/health", label: "Health", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] " +
                "font-medium transition-colors",
              active
                ? "bg-overlay text-fg"
                : "text-muted hover:bg-overlay/60 hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-[7px] bg-accent text-accent-fg">
        <Sparkles className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight tracking-tight">
          filmwright
        </span>
        <span className="block font-mono text-[10px] leading-tight text-subtle">
          prompt → mp4
        </span>
      </span>
    </Link>
  );
}

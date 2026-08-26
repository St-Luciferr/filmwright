"use client";

import { Menu as MenuIcon, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Brand, NAV, NavLinks, isActive } from "@/components/app/nav";
import { WorkerPill } from "@/components/app/worker-pill";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";

/** The page title in the topbar, derived from the route rather than passed down. */
function useSectionTitle() {
  const pathname = usePathname();
  if (pathname.startsWith("/jobs/")) return "Job";
  if (pathname === "/new") return "New video";
  return NAV.find((n) => isActive(pathname, n.href, n.exact))?.label ?? "filmwright";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNav, setMobileNav] = React.useState(false);
  const pathname = usePathname();
  const title = useSectionTitle();

  // Route changes must close the drawer, or navigating from it leaves the
  // overlay covering the page you just asked for.
  React.useEffect(() => setMobileNav(false), [pathname]);

  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-inset px-3 py-4 lg:flex">
            <div className="px-1.5 pb-5">
              <Brand />
            </div>
            <NavLinks />
            <div className="mt-auto space-y-3 px-1.5 pt-4">
              <WorkerPill />
              <p className="font-mono text-[10px] leading-relaxed text-subtle">
                free media only — no paid
                <br />
                credentials anywhere
              </p>
            </div>
          </aside>

          {/* Mobile drawer */}
          {mobileNav && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setMobileNav(false)}
              />
              <aside className="animate-in absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-inset px-3 py-4">
                <div className="flex items-center justify-between px-1.5 pb-5">
                  <Brand />
                  <button
                    onClick={() => setMobileNav(false)}
                    aria-label="Close navigation"
                    className="rounded p-1 text-subtle hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <NavLinks onNavigate={() => setMobileNav(false)} />
                <div className="mt-auto px-1.5">
                  <WorkerPill />
                </div>
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-base/85 px-4 backdrop-blur-md sm:px-6">
              <button
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
                className="rounded-control p-1.5 text-muted hover:bg-overlay hover:text-fg lg:hidden"
              >
                <MenuIcon className="size-4.5" />
              </button>
              <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
              <div className="ml-auto flex items-center gap-2">
                {/* The sidebar carries this on desktop; below lg there is no
                    sidebar, so the topbar has to. */}
                <span className="hidden sm:block lg:hidden">
                  <WorkerPill />
                </span>
                <Button asChild size="sm" variant="primary">
                  <Link href="/new">
                    <Plus />
                    New video
                  </Link>
                </Button>
              </div>
            </header>

            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
              <div className="mx-auto w-full max-w-[1400px]">{children}</div>
            </main>
          </div>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}

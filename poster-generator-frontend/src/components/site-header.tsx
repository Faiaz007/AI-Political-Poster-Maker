"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function SiteHeader() {
  const { user, initialising, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Suppress the sign-in link while the session is still being checked, so the
  // header does not flash "Sign in" for an already-authenticated user.
  const checking = initialising;

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-base font-bold text-white"
          >
            প
          </span>
          <span className="text-lg font-bold tracking-tight">পোস্টার তৈরি</span>
        </Link>

        <nav className="flex items-center gap-2">
          {checking ? null : user ? (
            <>
              <Link
                href="/posters/new"
                className="btn-primary hidden sm:inline-flex"
              >
                নতুন পোস্টার
              </Link>
              <Link
                href="/dashboard"
                className={`btn-secondary ${pathname === "/dashboard" ? "ring-2 ring-brand-500/40" : ""}`}
              >
                আমার পোস্টার
              </Link>
              <span className="hidden max-w-40 truncate text-sm text-neutral-600 md:inline">
                {user.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.push("/");
                }}
                className="btn-secondary"
              >
                বের হোন
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">
                লগইন
              </Link>
              <Link href="/register" className="btn-primary">
                অ্যাকাউন্ট খুলুন
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

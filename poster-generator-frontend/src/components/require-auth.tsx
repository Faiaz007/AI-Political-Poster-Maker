"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Client-side guard for authenticated screens.
 *
 * This is a UX affordance, not a security control: the real access control is
 * the JWT check the API performs on every request. Redirecting here just avoids
 * flashing a signed-out shell. `initialising` is respected so we do not bounce
 * the user to /login while their session is still being verified.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialising } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initialising && !user) {
      router.replace("/login");
    }
  }, [initialising, user, router]);

  if (initialising) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-neutral-500">লোড হচ্ছে…</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Shared by the login and register screens. Two separate pages would duplicate
 * the same error handling, the same field markup and the same submit guard,
 * which is exactly the kind of duplication that drifts apart.
 */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const { login, register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isRegister) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      // Push rather than replace: the session state lives in the provider, so
      // going back should not return to a form that is already satisfied.
      router.push("/dashboard");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.fieldErrors) {
          setFieldErrors(
            Object.fromEntries(caught.fieldErrors.map((f) => [f.field, f.message])),
          );
        }
      } else {
        setError("অ্যাকাউন্ট খোলা যায়নি। আবার চেষ্টা করুন।");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight">
        {isRegister ? "অ্যাকাউন্ট খুলুন" : "লগইন করুন"}
      </h1>
      <p className="mt-2 text-neutral-600">
        {isRegister
          ? "পোস্টার তৈরি ও সংরক্ষণ করতে একটি অ্যাকাউন্ট লাগবে।"
          : "আপনার অ্যাকাউন্টে প্রবেশ করুন।"}
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6" noValidate>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {isRegister ? (
          <div>
            <label htmlFor="name" className="field-label">
              আপনার নাম
            </label>
            <input
              id="name"
              name="name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              maxLength={100}
            />
            {fieldErrors.name ? <p className="field-error">{fieldErrors.name}</p> : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="field-label">
            ইমেইল
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            পাসওয়ার্ড
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={isRegister ? 8 : undefined}
          />
          {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
          {isRegister ? (
            <p className="mt-1.5 text-sm text-neutral-500">কমপক্ষে ৮ অক্ষরের হতে হবে।</p>
          ) : null}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting
            ? "অপেক্ষা করুন…"
            : isRegister
              ? "অ্যাকাউন্ট খুলুন"
              : "লগইন করুন"}
        </button>

        <p className="text-center text-sm text-neutral-600">
          {isRegister ? "আগে থেকেই অ্যাকাউন্ট আছে?" : "অ্যাকাউন্ট নেই?"}{" "}
          <Link
            href={isRegister ? "/login" : "/register"}
            className="font-semibold text-brand-700 hover:underline"
          >
            {isRegister ? "লগইন করুন" : "অ্যাকাউন্ট খুলুন"}
          </Link>
        </p>
      </form>
    </div>
  );
}

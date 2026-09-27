import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "অ্যাকাউন্ট খুলুন" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}

import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFrame eyebrow="Admin panel" title="Welcome back" description="Sign in to continue managing your project and its content.">
      <AuthForm mode="login" />
    </AuthFrame>
  );
}

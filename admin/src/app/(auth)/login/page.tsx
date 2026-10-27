import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFrame title="Sign in">
      <AuthForm mode="login" />
    </AuthFrame>
  );
}

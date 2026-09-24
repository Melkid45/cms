import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthFrame eyebrow="New administrator" title="Create your account" description="This will be the primary project owner profile. You can invite your team later.">
      <AuthForm mode="register" />
    </AuthFrame>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = { mode: "login" | "register" };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => router.push("/dashboard"), 550);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isRegister && (
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="Ilya Melman" required className="h-11" />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="name@company.ru" required className="h-11" />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {!isRegister && <button type="button" className="text-xs text-neutral-500 underline-offset-4 hover:text-black hover:underline">Forgot password?</button>}
        </div>
        <div className="relative">
          <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="At least 8 characters" minLength={8} required className="h-11 pr-11" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-neutral-400 hover:text-black" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {isRegister && (
        <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-neutral-500">
          <input type="checkbox" required className="mt-0.5 size-4 rounded border-neutral-300 accent-black" />
          <span>I agree to the terms of use and privacy policy.</span>
        </label>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
        {loading ? <LoaderCircle className="animate-spin" /> : isRegister ? "Create account" : "Sign in"}
        {!loading && <ArrowRight data-icon="inline-end" />}
      </Button>
      <p className="pt-2 text-center text-sm text-neutral-500">
        {isRegister ? "Already have an account?" : "New to Harbstone?"}{" "}
        <Link href={isRegister ? "/login" : "/register"} className="font-medium text-black underline-offset-4 hover:underline">
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

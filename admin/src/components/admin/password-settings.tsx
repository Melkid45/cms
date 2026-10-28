"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function PasswordSettings() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="rounded-xl border bg-white">
      <div className="flex items-center gap-3 border-b border-neutral-100 p-6">
        <KeyRound className="size-5 text-neutral-500" />
        <div>
          <h2 className="font-semibold">Your password</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Change the password you use to sign in.
          </p>
        </div>
      </div>
      <form
        className="space-y-5 p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          if (data.get("password") !== data.get("confirm")) {
            setNotice("The new passwords do not match.");
            return;
          }
          setBusy(true);
          setNotice("");
          try {
            const response = await fetch("/api/builder/password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                currentPassword: data.get("currentPassword"),
                password: data.get("password"),
              }),
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error);
            form.reset();
            setNotice(
              "Password changed. Other signed-in sessions have been signed out.",
            );
            router.refresh();
          } catch (e) {
            setNotice(
              e instanceof Error ? e.message : "Could not change password.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              placeholder="At least 12 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </Button>
        <p role="status" className="text-sm">
          {notice}
        </p>
      </form>
    </section>
  );
}

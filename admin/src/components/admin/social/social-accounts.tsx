"use client";
import { Select, SelectOption } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { withSite } from "@/lib/builder/site-client";
import type { ConnectionStatus } from "@/lib/builder/social/shared";
import { NETWORK_NAMES } from "@/lib/builder/social/shared";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api, card } from "../orders/shared";

interface Overview {
  meta: {
    configured: boolean;
    connectedAt?: string;
    pageId?: string;
    instagram: boolean;
    pages: { id: string; name: string; instagram?: string }[];
  };
  tiktok: { configured: boolean; connectedAt?: string; name?: string };
  publicBase: string;
  redirectUris: { meta: string; tiktok: string } | null;
  statuses: ConnectionStatus[];
}
const hint = "text-xs leading-5 text-neutral-500";

// Settings → Social accounts (owner): connect the website's Facebook Page (+ linked
// Instagram business account) and TikTok account for one-click publishing.
export function SocialAccounts() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const result = new URLSearchParams(location.search).get("result");
    api<Overview>(withSite("/api/builder/social/accounts"))
      .then((overview) => {
        setData(overview);
        if (result === "connected") setNotice("Account connected.");
        else if (result) setError(result);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function change(init: RequestInit, url = "/api/builder/social/accounts") {
    setError("");
    try {
      setData(await api<Overview>(withSite(url), init));
      setNotice("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }
  const ready = (configured: boolean) => configured && !!data?.publicBase;
  return (
    <AdminPanel
      title="Social accounts"
      className="min-w-0"
    >
      {(error || notice) && (
        <p
          className={cn(
            "mb-5 rounded-lg px-4 py-3 text-sm",
            error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800",
          )}
        >
          {error || notice}
        </p>
      )}
      {data && (
        <div className="grid max-w-3xl gap-5">
          <section className={cn(card, "p-5 sm:p-6")}>
            <h2 className="text-base font-semibold">Facebook and Instagram</h2>
            <p className={cn(hint, "mt-1")}>
              Uses a Facebook Page; Instagram must be a professional account linked to that Page.
            </p>
            {!ready(data.meta.configured) ? (
              <NotReady
                missing={[
                  !data.meta.configured && "SOCIAL_META_APP_ID, SOCIAL_META_APP_SECRET",
                  !data.publicBase && "NEXT_PUBLIC_SITE_URL (https)",
                ]}
              />
            ) : (
              <div className="mt-4 grid gap-3">
                {data.meta.pages.length > 0 && (
                  <>
                    <label className="grid gap-1.5 text-sm">
                      Facebook Page
                      <Select
                        className="h-9 "
                        value={String(data.meta.pageId || "")}
                        onValueChange={(selectedValue) =>
                          change({
                            method: "PATCH",
                            body: JSON.stringify({ pageId: selectedValue, instagram: data.meta.instagram }),
                          })}
                      >
                        <SelectOption value="" disabled>
                          Choose a Page
                        </SelectOption>
                        {data.meta.pages.map((p) => (
                          <SelectOption key={p.id} value={String(p.id)}>
                            {p.name}
                            {p.instagram ? ` (Instagram @${p.instagram})` : " (no Instagram)"}
                          </SelectOption>
                        ))}
                      </Select>
                    </label>
                    {data.meta.pageId && (
                      <label className="flex items-center gap-3 text-sm">
                        <Switch
                          checked={data.meta.instagram}
                          onCheckedChange={(v) =>
                            change({
                              method: "PATCH",
                              body: JSON.stringify({ pageId: data.meta.pageId, instagram: v }),
                            })
                          }
                        />
                        Publish to the linked Instagram account
                      </label>
                    )}
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <a className={buttonVariants()} href={withSite("/api/builder/social/oauth/meta")}>{data.meta.connectedAt ? "Reconnect" : "Connect Facebook & Instagram"}</a>
                  {data.meta.connectedAt && (
                    <Button variant="outline" onClick={() => change({ method: "DELETE" }, "/api/builder/social/accounts?provider=meta")}>
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
          <section className={cn(card, "p-5 sm:p-6")}>
            <h2 className="text-base font-semibold">TikTok</h2>
            <p className={cn(hint, "mt-1")}>
              Photo posts (9:16 images). Until TikTok audits the app, posts are visible only to
              the account owner.
            </p>
            {!ready(data.tiktok.configured) ? (
              <NotReady
                missing={[
                  !data.tiktok.configured && "SOCIAL_TIKTOK_CLIENT_KEY, SOCIAL_TIKTOK_CLIENT_SECRET",
                  !data.publicBase && "NEXT_PUBLIC_SITE_URL (https)",
                ]}
              />
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {data.tiktok.name && <span className="text-sm">{data.tiktok.name}</span>}
                <a className={buttonVariants()} href={withSite("/api/builder/social/oauth/tiktok")}>{data.tiktok.connectedAt ? "Reconnect" : "Connect TikTok"}</a>
                {data.tiktok.connectedAt && (
                  <Button variant="outline" onClick={() => change({ method: "DELETE" }, "/api/builder/social/accounts?provider=tiktok")}>
                    Disconnect
                  </Button>
                )}
              </div>
            )}
          </section>
          <section className={cn(card, "p-5 sm:p-6")}>
            <h2 className="text-base font-semibold">Status</h2>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {data.statuses.map((s) => (
                <li key={s.network}>
                  {NETWORK_NAMES[s.network]}:{" "}
                  <span className="text-neutral-600">
                    {s.connected ? `connected (${s.account})` : s.configured ? "not connected" : "app not configured"}
                  </span>
                </li>
              ))}
            </ul>
            {data.redirectUris && (
              <p className={cn(hint, "mt-3 break-all")}>
                Redirect URIs: {data.redirectUris.meta} · {data.redirectUris.tiktok}
              </p>
            )}
          </section>
        </div>
      )}
    </AdminPanel>
  );
}

function NotReady({ missing }: { missing: (string | false)[] }) {
  return (
    <p className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600">
      Not available yet: the server needs {missing.filter(Boolean).join(" and ")}. See
      BUILDER.md → Social posts for the setup steps.
    </p>
  );
}

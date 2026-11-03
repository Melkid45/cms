"use client";
import { useEffect, useState } from "react";
import {
  DatabaseBackup,
  Download,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useProject } from "@/lib/builder/client";
import { PageHeader } from "./page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@base-ui/react/dialog";
type Backup = {
  id: string;
  kind: string;
  createdAt: string;
  pages: number;
  media: number;
};
export function Backups() {
  const { project, refresh } = useProject();
  const [items, setItems] = useState<Backup[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Backup | null>(null),
    [confirmation, setConfirmation] = useState("");
  async function load() {
    const response = await fetch("/api/builder/backups", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    setItems(data);
  }
  useEffect(() => {
    let active = true;
    fetch("/api/builder/backups", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        if (active) setItems(data);
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(value: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/builder/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (value.action === "restore") {
        await refresh();
        setSelected(null);
        setConfirmation("");
        setNotice(
          "Website restored. The state before restoration is available as a safety snapshot.",
        );
      } else setNotice(data.message || "Full backup created and verified.");
      await load();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not complete backup operation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        title="Backups"
        description="Verified copies of pages, website settings and image files."
        action={
          <Button
            disabled={busy}
            onClick={() => void action({ action: "create" })}
          >
            <DatabaseBackup />
            {busy ? "Working…" : "Create full backup"}
          </Button>
        }
      />
      <div className="mb-6 rounded-xl border bg-white p-5 text-sm leading-6 text-neutral-500">
        Store up to five full copies, including independent image data (up to 32
        MB of media per copy). Download a copy for storage outside this
        database. Accounts, SMTP passwords and enquiries stay unchanged when you
        restore. This does not replace your hosting provider’s database backups.
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="flex flex-wrap items-center gap-4 rounded-xl border bg-white p-5"
          >
            <DatabaseBackup className="size-5 text-neutral-400" />
            <div className="min-w-0 flex-1">
              <h2 className="font-medium">
                {item.kind === "Full"
                  ? "Full website backup"
                  : "Before last restore · content snapshot"}
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {new Date(item.createdAt).toLocaleString()} · {item.pages} pages
                · {item.media} copied images
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void action({ action: "verify", id: item.id })}
            >
              <ShieldCheck /> Verify
            </Button>
            <Button
              nativeButton={false}
              render={
                <a href={`/api/builder/backups?download=${item.id}`} download />
              }
              variant="outline"
              size="sm"
            >
              <Download /> Download
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSelected(item);
                setConfirmation("");
              }}
            >
              <RotateCcw /> Restore
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete backup"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    "Permanently delete this backup? Download a copy first if you need it.",
                  )
                )
                  return;
                setBusy(true);
                try {
                  const response = await fetch(
                    `/api/builder/backups?id=${item.id}`,
                    { method: "DELETE" },
                  );
                  if (!response.ok) throw Error((await response.json()).error);
                  await load();
                  setNotice("Backup removed.");
                } catch (e) {
                  setNotice(
                    e instanceof Error ? e.message : "Could not remove backup.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 />
            </Button>
          </article>
        ))}
        {!items.length && (
          <p className="rounded-xl border bg-white p-10 text-center text-sm text-neutral-500">
            Create your first backup before making major changes.
          </p>
        )}
      </div>
      <p role="status" className="mt-5 text-sm">
        {notice}
      </p>
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!busy && !open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">
              Restore this backup?
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-neutral-500">
              Current pages, menus and website settings will be replaced,
              including published content. Image checksums are verified first. A
              content snapshot of the current state is saved before restoration;
              existing image files are retained.
            </Dialog.Description>
            <label
              htmlFor="restore-confirmation"
              className="mt-5 block text-sm font-medium"
            >
              Type RESTORE to continue
            </label>
            <Input
              id="restore-confirmation"
              className="mt-2"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-5 flex justify-end gap-3">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy || confirmation !== "RESTORE" || !project}
                onClick={() =>
                  void action({
                    action: "restore",
                    id: selected?.id,
                    revision: project?.revision,
                    confirm: "RESTORE",
                  })
                }
              >
                {busy ? "Restoring…" : "Restore website"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

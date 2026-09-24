import { ArrowRight, BriefcaseBusiness, FileText, Newspaper, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const collections = [
  { name: "Projects", count: 12, draft: 2, icon: BriefcaseBusiness },
  { name: "Journal", count: 8, draft: 1, icon: Newspaper },
  { name: "Services", count: 6, draft: 0, icon: FileText },
];

export default function ContentPage() {
  return (
    <div className="rise-in">
      <PageHeader title="Content" description="Structured collections used throughout the project pages." action={<Button><Plus data-icon="inline-start" /> Add entry</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {collections.map(({ name, count, draft, icon: Icon }) => (
          <Card key={name} className="group shadow-none transition-colors hover:border-black">
            <CardContent className="p-5">
              <div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-md bg-neutral-100"><Icon className="size-4" /></span><ArrowRight className="size-4 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-black" /></div>
              <h2 className="mt-7 text-base font-semibold">{name}</h2>
              <p className="mt-1 text-xs text-neutral-400">{count} entries{draft > 0 ? ` · ${draft} drafts` : " · all published"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

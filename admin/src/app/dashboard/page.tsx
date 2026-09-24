import Link from "next/link";
import { ArrowRight, Blocks, FileText, ImageIcon, LayoutGrid, MoreHorizontal, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const stats = [
  { label: "Pages", value: "12", note: "+2 this month", icon: LayoutGrid },
  { label: "Sections", value: "38", note: "6 templates", icon: Blocks },
  { label: "Entries", value: "24", note: "3 drafts", icon: FileText },
  { label: "Media files", value: "86", note: "124 MB", icon: ImageIcon },
];

const recent = [
  { name: "Home", type: "Page", author: "Ilya", time: "8 minutes ago", status: "Published" },
  { name: "Projects", type: "Page", author: "Ilya", time: "2 hours ago", status: "Draft" },
  { name: "Studio journal #04", type: "Entry", author: "Alex", time: "Yesterday, 18:42", status: "Published" },
  { name: "About", type: "Page", author: "Alex", time: "September 17", status: "Updated" },
];

export default function DashboardPage() {
  return (
    <div className="rise-in">
      <PageHeader
        title="Welcome, Ilya"
        description="A quick overview of your Harbstone website project."
        action={<Button><Plus data-icon="inline-start" /> Create page</Button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <Card key={label} className="shadow-none">
            <CardContent className="p-5">
              <div className="mb-7 flex items-start justify-between">
                <p className="text-xs font-medium text-neutral-500">{label}</p>
                <span className="grid size-8 place-items-center rounded-md border border-neutral-200"><Icon className="size-4" strokeWidth={1.7} /></span>
              </div>
              <p className="text-3xl font-semibold tracking-[-0.04em]">{value}</p>
              <p className="mt-1 text-[11px] text-neutral-400">{note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_310px]">
        <Card className="overflow-hidden shadow-none">
          <CardHeader className="flex-row items-center justify-between border-b py-4">
            <div><CardTitle className="text-sm">Recent changes</CardTitle><p className="mt-1 text-xs text-neutral-400">Latest team activity</p></div>
            <Link href="/dashboard/content" className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-black">View all content <ArrowRight className="size-3" /></Link>
          </CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead className="pl-5">Name</TableHead><TableHead>Author</TableHead><TableHead>Updated</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {recent.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="py-3.5 pl-5"><p className="font-medium">{item.name}</p><p className="text-[11px] text-neutral-400">{item.type}</p></TableCell>
                  <TableCell className="text-neutral-500">{item.author}</TableCell>
                  <TableCell className="text-neutral-500">{item.time}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal"><span className="mr-1 size-1.5 rounded-full bg-black" />{item.status}</Badge></TableCell>
                  <TableCell><button className="grid size-8 place-items-center rounded hover:bg-neutral-100" aria-label="Actions"><MoreHorizontal className="size-4" /></button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="h-fit shadow-none">
          <CardHeader className="border-b py-4"><CardTitle className="text-sm">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-3">
            {[
              ["New page", "Build with sections", LayoutGrid, "/dashboard/pages"],
              ["Add content", "Entry or project", FileText, "/dashboard/content"],
              ["Upload files", "Images and documents", ImageIcon, "/dashboard/media"],
            ].map(([title, subtitle, Icon, href]) => (
              <Link key={String(title)} href={String(href)} className="flex items-center gap-3 rounded-md p-3 hover:bg-neutral-50">
                <span className="grid size-9 place-items-center rounded-md bg-neutral-100"><Icon className="size-4" /></span>
                <span className="flex-1"><span className="block text-xs font-medium">{String(title)}</span><span className="block text-[11px] text-neutral-400">{String(subtitle)}</span></span>
                <ArrowRight className="size-3.5 text-neutral-300" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

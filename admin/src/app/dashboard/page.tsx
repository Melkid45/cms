"use client";
import Link from "next/link";
import { useProject } from "@/lib/builder/client";
import { useAccess } from "@/components/admin/access-context";
import Submissions from "@/components/admin/inbox";
import { definitions } from "@/lib/builder/catalog";
import {
  ArrowRight,
  Blocks,
  FileText,
  ImageIcon,
  LayoutGrid,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DashboardPage() {
  const { project } = useProject();
  const { isOwner } = useAccess();
  const stats = [
    {
      label: "Pages",
      value: String(project?.pages.filter((p) => !p.deletedAt).length ?? 0),
      note: "Saved website pages",
      icon: LayoutGrid,
    },
    {
      label: "Sections",
      value: String(
        project?.pages
          .filter((p) => !p.deletedAt)
          .reduce((n, p) => n + p.sections.length, 0) ?? 0,
      ),
      note: "Across your pages",
      icon: Blocks,
    },
    {
      label: "Variations",
      value: String(definitions.length),
      note: "Approved section and layout library",
      icon: FileText,
    },
    {
      label: "Media files",
      value: String(project?.media.length ?? 0),
      note: "Available to all image fields",
      icon: ImageIcon,
    },
  ];
  const recent = (project?.pages ?? [])
    .filter((p) => !p.deletedAt)
    .map((page) => ({
      name: page.title,
      type: `${page.sections.length} sections`,
      author: "Page",
      time: new Date(page.updatedAt).toLocaleDateString("en-GB"),
      status: page.status,
      slug: page.slug,
    }));
  if (!isOwner) return <Submissions overview />;
  return (
    <div className="rise-in">
      <PageHeader
        title="Welcome, Ilya"
        description="A quick overview of your Harbstone website project."
        action={
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/pages/new" />}
          >
            <Plus data-icon="inline-start" /> Create page
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <Card key={label} className="shadow-none">
            <CardContent className="p-5">
              <div className="mb-7 flex items-start justify-between">
                <p className="text-xs font-medium text-neutral-500">{label}</p>
                <span className="grid size-8 place-items-center rounded-md border border-neutral-200">
                  <Icon className="size-4" strokeWidth={1.7} />
                </span>
              </div>
              <p className="text-3xl font-semibold tracking-[-0.04em]">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">{note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_310px]">
        <Card className="overflow-hidden shadow-none">
          <CardHeader className="flex-row items-center justify-between border-b py-4">
            <div>
              <CardTitle className="text-sm">Recent changes</CardTitle>
              <p className="mt-1 text-xs text-neutral-400">
                Latest team activity
              </p>
            </div>
            <Link
              href="/dashboard/content"
              className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-black"
            >
              View all content <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="py-3.5 pl-5">
                    <Link
                      href={`/dashboard/pages/${item.slug}`}
                      className="font-medium"
                    >
                      {item.name}
                    </Link>
                    <p className="text-[11px] text-neutral-400">{item.type}</p>
                  </TableCell>
                  <TableCell className="text-neutral-500">
                    {item.author}
                  </TableCell>
                  <TableCell className="text-neutral-500">
                    {item.time}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      <span className="mr-1 size-1.5 rounded-full bg-black" />
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      className="grid size-8 place-items-center rounded hover:bg-neutral-100"
                      aria-label="Actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="h-fit shadow-none">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-sm">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {[
              [
                "New page",
                "Build with sections",
                LayoutGrid,
                "/dashboard/pages",
              ],
              [
                "Add content",
                "Entry or project",
                FileText,
                "/dashboard/content",
              ],
              [
                "Upload files",
                "Images and documents",
                ImageIcon,
                "/dashboard/media",
              ],
            ].map(([title, subtitle, Icon, href]) => (
              <Link
                key={String(title)}
                href={String(href)}
                className="flex items-center gap-3 rounded-md p-3 hover:bg-neutral-50"
              >
                <span className="grid size-9 place-items-center rounded-md bg-neutral-100">
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-medium">
                    {String(title)}
                  </span>
                  <span className="block text-[11px] text-neutral-400">
                    {String(subtitle)}
                  </span>
                </span>
                <ArrowRight className="size-3.5 text-neutral-300" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

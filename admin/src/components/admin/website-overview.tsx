"use client";
import Link from "next/link";
import { useProject } from "@/lib/builder/client";
import { useAccess } from "@/components/admin/access-context";
import Submissions from "@/components/admin/inbox";
import { ChangeRequests } from "@/components/admin/change-requests";
import { CrmOverview } from "@/components/admin/crm/crm-overview";
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
import { AdminPanel } from "@/components/admin/admin-panel";
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

export function WebsiteOverview() {
  const { project } = useProject();
  const { isOwner, canDesign } = useAccess();
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
  // Clients also get change requests; designers keep the enquiries overview.
  if (!isOwner && !canDesign)
    return (
      <>
        <CrmOverview />
        <Submissions overview />
        <div className="mt-8">
          <ChangeRequests />
        </div>
      </>
    );
  if (!isOwner) return <Submissions overview />;
  return (
    <AdminPanel
      title="Overview"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/pages/new" />}
          >
            <Plus data-icon="inline-start" /> Create page
          </Button>
        }</div>}
    >

      <CrmOverview />
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <Card key={label} className="shadow-none">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between">
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

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_310px]">
        <Card className="overflow-hidden shadow-none">
          <CardHeader className="flex-row items-center justify-between border-b py-4">
            <CardTitle className="text-sm">Recent changes</CardTitle>
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
                <TableRow key={item.slug}>
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
    </AdminPanel>
  );
}

import { Mail, MoreHorizontal, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const members = [
  { name: "Ilya Melman", email: "ilya@harbstone.com", initials: "IM", role: "Owner" },
  { name: "Alex Morgan", email: "alex@harbstone.com", initials: "AM", role: "Editor" },
];

export default function TeamPage() {
  return (
    <div className="rise-in">
      <PageHeader title="Team" description="Project members and their access permissions." action={<Button><Plus data-icon="inline-start" /> Invite member</Button>} />
      <Card className="overflow-hidden shadow-none">
        <Table><TableHeader><TableRow><TableHead className="pl-5">Member</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {members.map((member) => <TableRow key={member.email}><TableCell className="py-4 pl-5"><div className="flex items-center gap-3"><Avatar><AvatarFallback className="bg-neutral-100 text-xs">{member.initials}</AvatarFallback></Avatar><span><span className="block font-medium">{member.name}</span><span className="flex items-center gap-1 text-[11px] text-neutral-400"><Mail className="size-3" />{member.email}</span></span></div></TableCell><TableCell>{member.role}</TableCell><TableCell><Badge variant="outline">Active</Badge></TableCell><TableCell><button className="grid size-8 place-items-center rounded hover:bg-neutral-100" aria-label={`Actions for ${member.name}`}><MoreHorizontal className="size-4" /></button></TableCell></TableRow>)}
        </TableBody></Table>
      </Card>
    </div>
  );
}

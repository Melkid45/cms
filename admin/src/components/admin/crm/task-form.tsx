"use client";
import { Select, SelectOption } from "@/components/ui/select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CrmData, Task } from "@/lib/builder/crm/shared";
import { Dialog, field, label } from "./crm-ui";
import { fromLocalInput, toLocalInput } from "./use-crm";

export interface TaskInput {
  title: string;
  due: string;
  assigneeId: string;
  contactId?: string;
  dealId?: string;
}
// Tomorrow 10:00 local time: a sensible default due time.
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};
export function TaskForm({
  data,
  task,
  contactId,
  dealId,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  data: CrmData;
  task?: Task;
  contactId?: string;
  dealId?: string;
  busy: boolean;
  onSave: (input: TaskInput) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    title: task?.title || "",
    due: toLocalInput(task ? task.due : tomorrow()),
    assigneeId: task?.assigneeId ?? data.me,
    contactId: task?.contactId || contactId || "",
    dealId: task?.dealId || dealId || "",
  });
  const set = (key: keyof typeof value) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValue((v) => ({ ...v, [key]: e.target.value }));
  const deals = data.deals.filter((d) => !value.contactId || d.contactId === value.contactId);
  return (
    <Dialog title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onSave({
            title: value.title,
            due: fromLocalInput(value.due),
            assigneeId: value.assigneeId,
            ...(value.contactId ? { contactId: value.contactId } : {}),
            ...(value.dealId ? { dealId: value.dealId } : {}),
          });
          if (ok) onClose();
        }}
      >
        <div className="sm:col-span-2">
          <label className={label} htmlFor="task-title">Task</label>
          <input id="task-title" className={field} value={value.title} onChange={set("title")} maxLength={300} required autoFocus placeholder="Call back about the offer" />
        </div>
        <div>
          <label className={label} htmlFor="task-due">Due</label>
          <input id="task-due" type="datetime-local" className={field} value={value.due} onChange={set("due")} />
        </div>
        <div>
          <label className={label} htmlFor="task-assignee">Assignee</label>
          <Select id="task-assignee" className="h-9 " value={String(value.assigneeId)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["assigneeId"]: selectedValue }))}>
            <SelectOption value="">Nobody</SelectOption>
            {data.team.map((m) => (
              <SelectOption key={m.id} value={String(m.id)}>
                {m.name}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div>
          <label className={label} htmlFor="task-contact">Contact</label>
          <Select id="task-contact" className="h-9 " value={String(value.contactId)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["contactId"]: selectedValue }))} disabled={!!contactId && !task}>
            <SelectOption value="">—</SelectOption>
            {data.contacts.map((c) => (
              <SelectOption key={c.id} value={String(c.id)}>
                {c.name || c.email || c.phone}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div>
          <label className={label} htmlFor="task-deal">Deal</label>
          <Select id="task-deal" className="h-9 " value={String(value.dealId)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["dealId"]: selectedValue }))}>
            <SelectOption value="">—</SelectOption>
            {deals.map((d) => (
              <SelectOption key={d.id} value={String(d.id)}>
                {d.title}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div className="mt-2 flex items-center gap-2 sm:col-span-2">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (confirm("Delete this task?") && (await onDelete())) onClose();
              }}
            >
              Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !value.title.trim()}>
            {task ? "Save" : "Add task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

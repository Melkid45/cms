"use client";
import { createContext, useContext, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Section } from "@/lib/builder/types";
const Handle = createContext<Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
> | null>(null);
export function SortableSections({
  sections,
  onChange,
  children,
  lockedIds = [],
}: {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  children: ReactNode;
  lockedIds?: string[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) {
          const next = arrayMove(
            sections,
            sections.findIndex((s) => s.id === active.id),
            sections.findIndex((s) => s.id === over.id),
          );
          if (
            !sections.some(
              (s, i) => lockedIds.includes(s.id) && next[i].id !== s.id,
            )
          )
            onChange(next);
        }
      }}
    >
      <SortableContext
        items={sections.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}
export function SortableSection({
  section,
  children,
  disabled = false,
}: {
  section: Section;
  children: ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled });
  return (
    <Handle.Provider value={{ attributes, listeners, setActivatorNodeRef }}>
      <div
        ref={setNodeRef}
        data-editor-section={section.id}
        tabIndex={-1}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          position: "relative",
          zIndex: isDragging ? 10 : undefined,
        }}
        className={`scroll-mt-24 overflow-hidden rounded-lg border bg-white outline-none data-[preview-selected=true]:ring-2 data-[preview-selected=true]:ring-neutral-900 data-[preview-selected=true]:ring-offset-2 ${section.hidden ? "opacity-60" : ""} ${isDragging ? "border-black shadow-lg" : ""}`}
      >
        {children}
      </div>
    </Handle.Provider>
  );
}
export function SectionDragHandle({
  index,
  disabled = false,
}: {
  index: number;
  disabled?: boolean;
}) {
  const { attributes, listeners, setActivatorNodeRef } = useContext(Handle)!;
  return (
    <Button
      type="button"
      disabled={disabled}
      variant="ghost"
      size="icon-sm"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag section ${index + 1} to reorder`}
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      <GripVertical />
    </Button>
  );
}

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
}: {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  children: ReactNode;
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
        if (over && active.id !== over.id)
          onChange(
            arrayMove(
              sections,
              sections.findIndex((s) => s.id === active.id),
              sections.findIndex((s) => s.id === over.id),
            ),
          );
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
}: {
  section: Section;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });
  return (
    <Handle.Provider value={{ attributes, listeners, setActivatorNodeRef }}>
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          position: "relative",
          zIndex: isDragging ? 10 : undefined,
        }}
        className={`overflow-hidden rounded-lg border bg-white ${section.hidden ? "opacity-60" : ""} ${isDragging ? "border-black shadow-lg" : ""}`}
      >
        {children}
      </div>
    </Handle.Provider>
  );
}
export function SectionDragHandle({ index }: { index: number }) {
  const {attributes,listeners,setActivatorNodeRef} = useContext(Handle)!;
  return (
    <Button
      type="button"
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

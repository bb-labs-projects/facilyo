'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChecklistItem } from './checklist-item';
import { cn, hapticFeedback } from '@/lib/utils';
import type { ChecklistItem as ChecklistItemType } from '@/types/database';

interface SortableChecklistProps {
  items: ChecklistItemType[];
  values: Record<string, unknown>;
  onItemChange: (itemId: string, value: unknown) => void;
  onReorder: (items: ChecklistItemType[]) => void;
  className?: string;
}

export function SortableChecklist({
  items,
  values,
  onItemChange,
  onReorder,
  className,
}: SortableChecklistProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: { active: { id: string } }) => {
    setActiveId(event.active.id);
    hapticFeedback('light');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
        ...item,
        order: index,
      }));

      hapticFeedback('medium');
      onReorder(newItems);
    }
  };

  const sortedItems = [...items].sort((a, b) => a.order - b.order);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={cn('space-y-2', className)}>
          {sortedItems.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              value={values[item.id]}
              onChange={(value) => onItemChange(item.id, value)}
              isDragging={activeId === item.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableItemProps {
  item: ChecklistItemType;
  value: unknown;
  onChange: (value: unknown) => void;
  isDragging: boolean;
}

function SortableItem({ item, value, onChange, isDragging }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ChecklistItem
        item={item}
        value={value}
        onChange={onChange}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Hook for managing checklist state
export function useChecklistState(initialItems: ChecklistItemType[] = []) {
  const [items, setItems] = useState(initialItems);
  const [values, setValues] = useState<Record<string, unknown>>({});

  const handleItemChange = useCallback((itemId: string, value: unknown) => {
    setValues((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  }, []);

  const handleReorder = useCallback((newItems: ChecklistItemType[]) => {
    setItems(newItems);
  }, []);

  const getCompletedCount = useCallback(() => {
    return items.filter((item) => {
      const value = values[item.id];
      switch (item.type) {
        case 'checkbox':
          return value === true;
        case 'text':
          return typeof value === 'string' && value.trim().length > 0;
        case 'number':
          return typeof value === 'number' && !isNaN(value);
        case 'photo':
          return typeof value === 'string' && value.length > 0;
        default:
          return false;
      }
    }).length;
  }, [items, values]);

  const getRequiredComplete = useCallback(() => {
    return items
      .filter((item) => item.required)
      .every((item) => {
        const value = values[item.id];
        switch (item.type) {
          case 'checkbox':
            return value === true;
          case 'text':
            return typeof value === 'string' && value.trim().length > 0;
          case 'number':
            return typeof value === 'number' && !isNaN(value);
          case 'photo':
            return typeof value === 'string' && value.length > 0;
          default:
            return false;
        }
      });
  }, [items, values]);

  const reset = useCallback(() => {
    setValues({});
  }, []);

  return {
    items,
    values,
    handleItemChange,
    handleReorder,
    getCompletedCount,
    getRequiredComplete,
    reset,
    setItems,
    setValues,
  };
}

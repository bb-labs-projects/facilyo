'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  Aufgabe,
  AufgabeInsert,
  AufgabeUpdate,
  Property,
  Profile,
  IssuePriority,
  IssueStatus,
} from '@/types/database';

interface AufgabeFormProps {
  aufgabe?: Aufgabe;
  onSubmit: (data: AufgabeInsert | AufgabeUpdate) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  mode?: 'create' | 'edit';
}

const priorityOptions: { value: IssuePriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'urgent', label: 'Dringend' },
];

const statusOptions: { value: IssueStatus; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'resolved', label: 'Erledigt' },
  { value: 'closed', label: 'Geschlossen' },
];

export function AufgabeForm({
  aufgabe,
  onSubmit,
  onCancel,
  isLoading = false,
  mode = 'create',
}: AufgabeFormProps) {
  const profile = useAuthStore((state) => state.profile);

  const [title, setTitle] = useState(aufgabe?.title || '');
  const [description, setDescription] = useState(aufgabe?.description || '');
  const [propertyId, setPropertyId] = useState(aufgabe?.property_id || '');
  const [assignedTo, setAssignedTo] = useState(aufgabe?.assigned_to || '');
  const [priority, setPriority] = useState<IssuePriority>(aufgabe?.priority || 'medium');
  const [status, setStatus] = useState<IssueStatus>(aufgabe?.status || 'open');
  const [dueDate, setDueDate] = useState(aufgabe?.due_date || '');

  // Fetch properties
  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Property[];
    },
  });

  // Fetch users (employees)
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('first_name');

      if (error) throw error;
      return data as Profile[];
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    const data: AufgabeInsert | AufgabeUpdate = {
      title: title.trim(),
      description: description.trim() || null,
      property_id: propertyId,
      assigned_to: assignedTo || null,
      priority,
      status,
      due_date: dueDate || null,
    };

    if (mode === 'create') {
      (data as AufgabeInsert).created_by = profile!.id;
    }

    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium">
          Titel <span className="text-error-500">*</span>
        </label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Aufgabentitel"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Beschreibung
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Beschreiben Sie die Aufgabe..."
          rows={4}
          className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      {/* Property selection */}
      <div className="space-y-2">
        <label htmlFor="property" className="text-sm font-medium">
          Liegenschaft <span className="text-error-500">*</span>
        </label>
        <select
          id="property"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          required
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Liegenschaft wählen...</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </div>

      {/* Assignee */}
      <div className="space-y-2">
        <label htmlFor="assignee" className="text-sm font-medium">
          Zugewiesen an
        </label>
        <select
          id="assignee"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Niemand zugewiesen</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.first_name} {user.last_name} ({user.email})
            </option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div className="space-y-2" role="group" aria-labelledby="aufgabe-priority-label">
        <span id="aufgabe-priority-label" className="text-sm font-medium">Priorität</span>
        <div className="flex flex-wrap gap-2">
          {priorityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPriority(option.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                priority === option.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status (only for edit mode) */}
      {mode === 'edit' && (
        <div className="space-y-2" role="group" aria-labelledby="aufgabe-status-label">
          <span id="aufgabe-status-label" className="text-sm font-medium">Status</span>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  status === option.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Due date */}
      <div className="space-y-2">
        <label htmlFor="dueDate" className="text-sm font-medium">
          Fälligkeitsdatum
        </label>
        <Input
          id="dueDate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1"
            disabled={isLoading}
          >
            Abbrechen
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1"
          disabled={isLoading || !title.trim() || !propertyId}
        >
          {isLoading
            ? mode === 'create'
              ? 'Wird erstellt...'
              : 'Wird gespeichert...'
            : mode === 'create'
            ? 'Aufgabe erstellen'
            : 'Änderungen speichern'}
        </Button>
      </div>
    </form>
  );
}

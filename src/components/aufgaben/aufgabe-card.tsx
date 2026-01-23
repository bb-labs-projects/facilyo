'use client';

import { Calendar, User, MapPin, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Aufgabe, AufgabeWithRelations } from '@/types/database';

interface AufgabeCardProps {
  aufgabe: Aufgabe | AufgabeWithRelations;
  onClick?: () => void;
  showProperty?: boolean;
  className?: string;
}

const priorityConfig = {
  low: { label: 'Niedrig', class: 'bg-muted text-muted-foreground' },
  medium: { label: 'Mittel', class: 'badge-info' },
  high: { label: 'Hoch', class: 'badge-warning' },
  urgent: { label: 'Dringend', class: 'badge-error' },
};

const statusConfig = {
  open: { label: 'Offen', class: 'badge-error' },
  in_progress: { label: 'In Bearbeitung', class: 'badge-warning' },
  resolved: { label: 'Erledigt', class: 'badge-success' },
  closed: { label: 'Geschlossen', class: 'bg-muted text-muted-foreground' },
};

export function AufgabeCard({
  aufgabe,
  onClick,
  showProperty = false,
  className,
}: AufgabeCardProps) {
  const priority = priorityConfig[aufgabe.priority];
  const status = statusConfig[aufgabe.status];
  const hasRelations = 'property' in aufgabe;
  const aufgabeWithRelations = aufgabe as AufgabeWithRelations;

  // Check if due date is past
  const isOverdue = aufgabe.due_date && new Date(aufgabe.due_date) < new Date() && aufgabe.status !== 'resolved' && aufgabe.status !== 'closed';

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={cn(
        aufgabe.priority === 'urgent' && 'border-error-300',
        aufgabe.priority === 'high' && 'border-warning-300',
        isOverdue && 'border-error-300 bg-error-50/50',
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium line-clamp-1">{aufgabe.title}</h3>
              {onClick && (
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
            </div>

            {/* Property name */}
            {showProperty && hasRelations && aufgabeWithRelations.property && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {aufgabeWithRelations.property.name}
              </p>
            )}

            {/* Description preview */}
            {aufgabe.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {aufgabe.description}
              </p>
            )}

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              {aufgabe.due_date && (
                <span className={cn(
                  'flex items-center gap-1',
                  isOverdue && 'text-error-600 font-medium'
                )}>
                  <Calendar className="h-3 w-3" />
                  {swissFormat.date(aufgabe.due_date)}
                  {isOverdue && ' (überfällig)'}
                </span>
              )}
              {hasRelations && aufgabeWithRelations.assignee && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {aufgabeWithRelations.assignee.first_name} {aufgabeWithRelations.assignee.last_name}
                </span>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <span className={cn('badge', status.class)}>{status.label}</span>
              <span className={cn('badge', priority.class)}>{priority.label}</span>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{swissFormat.relative(aufgabe.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// List component
interface AufgabeListProps {
  aufgaben: (Aufgabe | AufgabeWithRelations)[];
  onAufgabeClick?: (aufgabe: Aufgabe | AufgabeWithRelations) => void;
  showProperty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function AufgabeList({
  aufgaben,
  onAufgabeClick,
  showProperty = false,
  emptyMessage = 'Keine Aufgaben vorhanden',
  className,
}: AufgabeListProps) {
  if (aufgaben.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {aufgaben.map((aufgabe) => (
        <AufgabeCard
          key={aufgabe.id}
          aufgabe={aufgabe}
          onClick={onAufgabeClick ? () => onAufgabeClick(aufgabe) : undefined}
          showProperty={showProperty}
        />
      ))}
    </div>
  );
}

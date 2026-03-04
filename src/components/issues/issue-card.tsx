'use client';

import { AlertTriangle, Clock, MapPin, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PhotoPreview } from './photo-capture';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Issue, IssueWithRelations } from '@/types/database';

interface IssueCardProps {
  issue: Issue | IssueWithRelations;
  onClick?: () => void;
  showProperty?: boolean;
  organizationName?: string;
  className?: string;
}

export function IssueCard({
  issue,
  onClick,
  showProperty = false,
  organizationName,
  className,
}: IssueCardProps) {
  const priorityConfig = {
    low: { label: 'Niedrig', class: 'bg-muted text-muted-foreground' },
    medium: { label: 'Mittel', class: 'badge-info' },
    high: { label: 'Hoch', class: 'badge-warning' },
    urgent: { label: 'Dringend', class: 'badge-error' },
  };

  const statusConfig = {
    open: { label: 'Offen', class: 'badge-error' },
    in_progress: { label: 'In Bearbeitung', class: 'badge-warning' },
    resolved: { label: 'Gelöst', class: 'badge-success' },
    closed: { label: 'Geschlossen', class: 'bg-muted text-muted-foreground' },
  };

  const categoryConfig = {
    damage: { label: 'Schaden', icon: AlertTriangle },
    cleaning: { label: 'Reinigung', icon: AlertTriangle },
    safety: { label: 'Sicherheit', icon: AlertTriangle },
    maintenance: { label: 'Wartung', icon: AlertTriangle },
    other: { label: 'Sonstiges', icon: AlertTriangle },
  };

  const priority = priorityConfig[issue.priority];
  const status = statusConfig[issue.status];
  const category = categoryConfig[issue.category];
  const CategoryIcon = category.icon;

  const hasRelations = 'property' in issue;

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={cn(
        issue.priority === 'urgent' && 'border-error-300',
        issue.priority === 'high' && 'border-warning-300',
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Category icon */}
          <div
            className={cn(
              'rounded-lg p-2 flex-shrink-0',
              issue.priority === 'urgent'
                ? 'bg-error-100'
                : issue.priority === 'high'
                ? 'bg-warning-100'
                : 'bg-muted'
            )}
          >
            <CategoryIcon
              className={cn(
                'h-5 w-5',
                issue.priority === 'urgent'
                  ? 'text-error-600'
                  : issue.priority === 'high'
                  ? 'text-warning-600'
                  : 'text-muted-foreground'
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium line-clamp-1">{issue.title}</h3>
              {onClick && (
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
            </div>

            {/* Property name */}
            {showProperty && hasRelations && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {(issue as IssueWithRelations).property.name}
              </p>
            )}

            {/* Description preview */}
            {issue.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {issue.description}
              </p>
            )}

            {/* Badges */}
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <span className={cn('badge', status.class)}>{status.label}</span>
              <span className={cn('badge', priority.class)}>{priority.label}</span>
              <span className="badge bg-muted text-muted-foreground">
                {category.label}
              </span>
              {organizationName && (
                <span className="badge bg-purple-100 text-purple-700">
                  {organizationName}
                </span>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{swissFormat.relative(issue.created_at)}</span>
              </div>

              {/* Photo preview */}
              {issue.photo_urls && issue.photo_urls.length > 0 && (
                <PhotoPreview photos={issue.photo_urls} />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Compact list item version
interface IssueListItemProps {
  issue: Issue;
  onClick?: () => void;
  className?: string;
}

export function IssueListItem({
  issue,
  onClick,
  className,
}: IssueListItemProps) {
  const priorityColors = {
    low: 'bg-muted',
    medium: 'bg-primary-500',
    high: 'bg-warning-500',
    urgent: 'bg-error-500',
  };

  const priorityLabels = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
    urgent: 'Dringend',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 text-left rounded-lg',
        'hover:bg-muted/50 transition-colors',
        className
      )}
    >
      {/* Priority indicator */}
      <div
        className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          priorityColors[issue.priority]
        )}
        aria-label={`Priorität: ${priorityLabels[issue.priority]}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{issue.title}</p>
        <p className="text-xs text-muted-foreground">
          {swissFormat.relative(issue.created_at)}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

// Issue list component
interface IssueListProps {
  issues: (Issue | IssueWithRelations)[];
  onIssueClick?: (issue: Issue | IssueWithRelations) => void;
  showProperty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function IssueList({
  issues,
  onIssueClick,
  showProperty = false,
  emptyMessage = 'Keine Probleme vorhanden',
  className,
}: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          onClick={onIssueClick ? () => onIssueClick(issue) : undefined}
          showProperty={showProperty}
        />
      ))}
    </div>
  );
}

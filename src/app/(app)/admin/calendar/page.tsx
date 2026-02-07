'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Building2,
  Car,
  Coffee,
  Wrench,
  Trees,
  Scissors,
  ClipboardList,
  Sparkles,
  Palmtree,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { swissFormat } from '@/lib/i18n';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  parseISO,
  differenceInSeconds,
  eachDayOfInterval,
  getDay,
} from 'date-fns';
import { de } from 'date-fns/locale';
import type { Profile, TimeEntry, WorkDay, Property, ActivityType, TimeEntryType } from '@/types/database';

type ViewMode = 'day' | 'week' | 'month';

interface TimeEntryWithProperty extends TimeEntry {
  property?: Property | null;
}

interface WorkDayWithEntries extends WorkDay {
  time_entries: TimeEntryWithProperty[];
}

// Activity type display configuration
const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: typeof Wrench; color: string }> = {
  hauswartung: { label: 'Hauswartung', icon: Wrench, color: 'text-blue-600 bg-blue-50' },
  rasen_maehen: { label: 'Rasen mähen', icon: Trees, color: 'text-green-600 bg-green-50' },
  hecken_schneiden: { label: 'Hecken schneiden', icon: Scissors, color: 'text-emerald-600 bg-emerald-50' },
  regie: { label: 'Regie', icon: ClipboardList, color: 'text-purple-600 bg-purple-50' },
  reinigung: { label: 'Reinigung', icon: Sparkles, color: 'text-cyan-600 bg-cyan-50' },
};

// Entry type display configuration
const ENTRY_TYPE_CONFIG: Record<TimeEntryType, { label: string; icon: typeof Car; color: string }> = {
  property: { label: 'Liegenschaft', icon: Building2, color: 'text-primary-600 bg-primary-50' },
  travel: { label: 'Fahrzeit', icon: Car, color: 'text-amber-600 bg-amber-50' },
  break: { label: 'Pause', icon: Coffee, color: 'text-orange-600 bg-orange-50' },
  vacation: { label: 'Ferien', icon: Palmtree, color: 'text-green-600 bg-green-50' },
};

function calculateDuration(entry: TimeEntry): number {
  if (!entry.start_time) return 0;
  const start = parseISO(entry.start_time);
  const end = entry.end_time ? parseISO(entry.end_time) : new Date();
  const duration = differenceInSeconds(end, start);
  return Math.max(0, duration - (entry.pause_duration || 0));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithProperty | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check permission
  const hasPermission = permissions.canManageUserCalendar;

  // Fetch users and properties in parallel for better performance
  const [usersQuery, propertiesQuery] = useQueries({
    queries: [
      {
        queryKey: ['users-for-calendar'],
        queryFn: async () => {
          const supabase = getClient();
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_active', true)
            .order('last_name');

          if (error) throw error;
          return data as Profile[];
        },
        enabled: hasPermission,
      },
      {
        queryKey: ['properties-for-calendar'],
        queryFn: async () => {
          const supabase = getClient();
          const { data, error } = await supabase
            .from('properties')
            .select('*')
            .eq('is_active', true)
            .order('name');

          if (error) throw error;
          return data as Property[];
        },
        enabled: hasPermission,
      },
    ],
  });

  const users = usersQuery.data ?? [];
  const properties = propertiesQuery.data ?? [];

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      return {
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
      };
    } else if (viewMode === 'week') {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    } else {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      };
    }
  }, [viewMode, currentDate]);

  // Fetch work days and time entries for selected user
  const { data: workDaysData = [], refetch } = useQuery({
    queryKey: ['calendar-work-days', selectedUserId, dateRange.start, dateRange.end],
    queryFn: async () => {
      if (!selectedUserId) return [];

      const supabase = getClient();
      const { data, error } = await supabase
        .from('work_days')
        .select(`
          *,
          time_entries (
            *,
            property:properties (*)
          )
        `)
        .eq('user_id', selectedUserId)
        .gte('date', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('date', format(dateRange.end, 'yyyy-MM-dd'))
        .order('date', { ascending: true });

      if (error) throw error;
      return data as WorkDayWithEntries[];
    },
    enabled: !!selectedUserId && hasPermission,
  });

  // Update time entry mutation
  type UpdateEntryInput = {
    id: string;
    start_time?: string;
    end_time?: string | null;
    entry_type?: TimeEntryType;
    property_id?: string | null;
    activity_type?: ActivityType | null;
    notes?: string | null;
  };

  const updateEntryMutation = useMutation({
    mutationFn: async (entry: UpdateEntryInput) => {
      const supabase = getClient();
      const { error } = await (supabase
        .from('time_entries') as any)
        .update({
          start_time: entry.start_time,
          end_time: entry.end_time,
          entry_type: entry.entry_type,
          property_id: entry.property_id,
          activity_type: entry.activity_type,
          notes: entry.notes,
        })
        .eq('id', entry.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Eintrag aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['calendar-work-days'] });
      setEditingEntry(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Fehler beim Aktualisieren');
    },
  });

  // Delete time entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const supabase = getClient();
      const { error } = await (supabase
        .from('time_entries') as any)
        .delete()
        .eq('id', entryId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Eintrag gelöscht');
      queryClient.invalidateQueries({ queryKey: ['calendar-work-days'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Fehler beim Löschen');
    },
  });

  // Navigation handlers
  const goToPrevious = () => {
    if (viewMode === 'day') {
      setCurrentDate((d) => addDays(d, -1));
    } else if (viewMode === 'week') {
      setCurrentDate((d) => subWeeks(d, 1));
    } else {
      setCurrentDate((d) => subMonths(d, 1));
    }
  };

  const goToNext = () => {
    if (viewMode === 'day') {
      setCurrentDate((d) => addDays(d, 1));
    } else if (viewMode === 'week') {
      setCurrentDate((d) => addWeeks(d, 1));
    } else {
      setCurrentDate((d) => addMonths(d, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success('Kalender aktualisiert');
  };

  // Get title for current view
  const getViewTitle = () => {
    if (viewMode === 'day') {
      return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
    } else if (viewMode === 'week') {
      return `${format(dateRange.start, 'd. MMM', { locale: de })} - ${format(dateRange.end, 'd. MMM yyyy', { locale: de })}`;
    } else {
      return format(currentDate, 'MMMM yyyy', { locale: de });
    }
  };

  // Get entries for a specific day
  const getEntriesForDay = (date: Date): TimeEntryWithProperty[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const workDay = workDaysData.find((wd) => wd.date === dateStr);
    return workDay?.time_entries || [];
  };

  // Calculate total time for a day
  const getTotalTimeForDay = (date: Date): number => {
    const entries = getEntriesForDay(date);
    return entries.reduce((sum, entry) => sum + calculateDuration(entry), 0);
  };

  // Render permission denied
  if (!hasPermission) {
    return (
      <PageContainer
        header={<Header title="Benutzerkalender" subtitle="Keine Berechtigung" />}
      >
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Sie haben keine Berechtigung, diese Seite anzuzeigen.
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      header={
        <Header
          title="Benutzerkalender"
          subtitle="Zeiteinträge anzeigen und bearbeiten"
          showRefresh={true}
          onRefresh={handleRefresh}
        />
      }
    >
      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* User selector */}
            <div className="flex-1 max-w-xs">
              <Label className="mb-2 block text-sm">Benutzer</Label>
              <Select
                value={selectedUserId || ''}
                onValueChange={(value) => setSelectedUserId(value || null)}
              >
                <SelectTrigger>
                  {selectedUserId ? (
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {(() => {
                        const user = users.find(u => u.id === selectedUserId);
                        return user ? `${user.first_name} ${user.last_name}` : 'Benutzer auswählen...';
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Benutzer auswählen...</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {user.first_name} {user.last_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'day' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('day')}
              >
                Tag
              </Button>
              <Button
                variant={viewMode === 'week' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('week')}
              >
                Woche
              </Button>
              <Button
                variant={viewMode === 'month' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('month')}
              >
                Monat
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={goToPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{getViewTitle()}</h2>
              <Button variant="ghost" size="sm" onClick={goToToday}>
                Heute
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calendar View */}
      {!selectedUserId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Bitte wählen Sie einen Benutzer aus</p>
          </CardContent>
        </Card>
      ) : viewMode === 'day' ? (
        <DayView
          date={currentDate}
          entries={getEntriesForDay(currentDate)}
          onEditEntry={setEditingEntry}
          onDeleteEntry={(entry) => deleteEntryMutation.mutate(entry.id)}
        />
      ) : viewMode === 'week' ? (
        <WeekView
          startDate={dateRange.start}
          workDays={workDaysData}
          onEditEntry={setEditingEntry}
          onDeleteEntry={(entry) => deleteEntryMutation.mutate(entry.id)}
          onDayClick={(date) => {
            setCurrentDate(date);
            setViewMode('day');
          }}
        />
      ) : (
        <MonthView
          currentDate={currentDate}
          workDays={workDaysData}
          onDayClick={(date) => {
            setCurrentDate(date);
            setViewMode('day');
          }}
        />
      )}

      {/* Edit Entry Dialog */}
      {editingEntry && (
        <EditEntryDialog
          entry={editingEntry}
          properties={properties}
          onClose={() => setEditingEntry(null)}
          onSave={(updates) => updateEntryMutation.mutate({ id: editingEntry.id, ...updates })}
          isLoading={updateEntryMutation.isPending}
        />
      )}
    </PageContainer>
  );
}

// Day View Component
interface DayViewProps {
  date: Date;
  entries: TimeEntryWithProperty[];
  onEditEntry: (entry: TimeEntryWithProperty) => void;
  onDeleteEntry: (entry: TimeEntryWithProperty) => void;
}

function DayView({ date, entries, onEditEntry, onDeleteEntry }: DayViewProps) {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const totalTime = entries.reduce((sum, e) => sum + calculateDuration(e), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {format(date, 'EEEE, d. MMMM yyyy', { locale: de })}
          </CardTitle>
          <div className="text-sm font-medium">
            Gesamt: {formatDuration(totalTime)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedEntries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Keine Einträge für diesen Tag
          </p>
        ) : (
          <div className="space-y-3">
            {sortedEntries.map((entry) => (
              <TimeEntryRow
                key={entry.id}
                entry={entry}
                onEdit={() => onEditEntry(entry)}
                onDelete={() => onDeleteEntry(entry)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Week View Component
interface WeekViewProps {
  startDate: Date;
  workDays: WorkDayWithEntries[];
  onEditEntry: (entry: TimeEntryWithProperty) => void;
  onDeleteEntry: (entry: TimeEntryWithProperty) => void;
  onDayClick: (date: Date) => void;
}

function WeekView({ startDate, workDays, onEditEntry, onDeleteEntry, onDayClick }: WeekViewProps) {
  const days = eachDayOfInterval({
    start: startDate,
    end: addDays(startDate, 6),
  });

  const getWorkDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return workDays.find((wd) => wd.date === dateStr);
  };

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const workDay = getWorkDay(day);
        const entries = workDay?.time_entries || [];
        const totalTime = entries.reduce((sum, e) => sum + calculateDuration(e), 0);
        const isToday = isSameDay(day, new Date());

        return (
          <Card
            key={day.toISOString()}
            className={cn(isToday && 'ring-2 ring-primary')}
          >
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onDayClick(day)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {format(day, 'EEEE, d. MMM', { locale: de })}
                  {isToday && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                      Heute
                    </span>
                  )}
                </CardTitle>
                <div className="text-sm font-mono">
                  {entries.length > 0 ? formatDuration(totalTime) : '-'}
                </div>
              </div>
            </CardHeader>
            {entries.length > 0 && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {entries
                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                    .slice(0, 3)
                    .map((entry) => (
                      <TimeEntryCompact
                        key={entry.id}
                        entry={entry}
                        onEdit={() => onEditEntry(entry)}
                      />
                    ))}
                  {entries.length > 3 && (
                    <button
                      onClick={() => onDayClick(day)}
                      className="text-sm text-primary hover:underline"
                    >
                      +{entries.length - 3} weitere Einträge
                    </button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Month View Component
interface MonthViewProps {
  currentDate: Date;
  workDays: WorkDayWithEntries[];
  onDayClick: (date: Date) => void;
}

function MonthView({ currentDate, workDays, onDayClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const getWorkDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return workDays.find((wd) => wd.date === dateStr);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-sm font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const workDay = getWorkDay(day);
            const entries = workDay?.time_entries || [];
            const totalTime = entries.reduce((sum, e) => sum + calculateDuration(e), 0);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());
            const hasEntries = entries.length > 0;

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDayClick(day)}
                className={cn(
                  'aspect-square p-1 rounded-lg text-sm transition-colors',
                  'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary',
                  !isCurrentMonth && 'text-muted-foreground/50',
                  isToday && 'ring-2 ring-primary',
                  hasEntries && isCurrentMonth && 'bg-primary-50'
                )}
              >
                <div className="h-full flex flex-col">
                  <span className={cn('font-medium', isToday && 'text-primary')}>
                    {format(day, 'd')}
                  </span>
                  {hasEntries && isCurrentMonth && (
                    <span className="text-xs text-muted-foreground mt-auto">
                      {formatDuration(totalTime)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Time Entry Row Component
interface TimeEntryRowProps {
  entry: TimeEntryWithProperty;
  onEdit: () => void;
  onDelete: () => void;
}

function TimeEntryRow({ entry, onEdit, onDelete }: TimeEntryRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const duration = calculateDuration(entry);
  const entryConfig = ENTRY_TYPE_CONFIG[entry.entry_type];
  const EntryIcon = entryConfig.icon;
  const activityConfig = entry.activity_type ? ACTIVITY_CONFIG[entry.activity_type] : null;
  const ActivityIcon = activityConfig?.icon;

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border',
          entryConfig.color
        )}
      >
        <EntryIcon className="h-5 w-5 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {entry.entry_type === 'property' && entry.property
                ? entry.property.name
                : entryConfig.label}
            </span>
            {activityConfig && ActivityIcon && (
              <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full', activityConfig.color)}>
                <ActivityIcon className="h-3 w-3" />
                {activityConfig.label}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {format(parseISO(entry.start_time), 'HH:mm')}
            {entry.end_time && ` - ${format(parseISO(entry.end_time), 'HH:mm')}`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{formatDuration(duration)}</span>
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteConfirm(true)}
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag löschen?</DialogTitle>
            <DialogDescription>
              Möchten Sie diesen Zeiteintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete();
              }}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact Time Entry for Week View
interface TimeEntryCompactProps {
  entry: TimeEntryWithProperty;
  onEdit: () => void;
}

function TimeEntryCompact({ entry, onEdit }: TimeEntryCompactProps) {
  const duration = calculateDuration(entry);
  const entryConfig = ENTRY_TYPE_CONFIG[entry.entry_type];
  const EntryIcon = entryConfig.icon;

  return (
    <div
      onClick={onEdit}
      className={cn(
        'flex items-center gap-2 p-2 rounded text-sm cursor-pointer hover:opacity-80 transition-opacity',
        entryConfig.color
      )}
    >
      <EntryIcon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">
        {entry.entry_type === 'property' && entry.property
          ? entry.property.name
          : entryConfig.label}
      </span>
      <span className="font-mono text-xs">{formatDuration(duration)}</span>
    </div>
  );
}

// Edit Entry Dialog
interface EditEntryUpdates {
  start_time: string;
  end_time: string | null;
  entry_type: TimeEntryType;
  property_id: string | null;
  activity_type: ActivityType | null;
  notes: string | null;
}

interface EditEntryDialogProps {
  entry: TimeEntryWithProperty;
  properties: Property[];
  onClose: () => void;
  onSave: (updates: EditEntryUpdates) => void;
  isLoading: boolean;
}

function EditEntryDialog({ entry, properties, onClose, onSave, isLoading }: EditEntryDialogProps) {
  const [startTime, setStartTime] = useState(
    format(parseISO(entry.start_time), "yyyy-MM-dd'T'HH:mm")
  );
  const [endTime, setEndTime] = useState(
    entry.end_time ? format(parseISO(entry.end_time), "yyyy-MM-dd'T'HH:mm") : ''
  );
  const [entryType, setEntryType] = useState<TimeEntryType>(entry.entry_type);
  const [propertyId, setPropertyId] = useState<string | null>(entry.property_id);
  const [activityType, setActivityType] = useState<ActivityType | null>(entry.activity_type || null);
  const [notes, setNotes] = useState(entry.notes || '');

  const handleSave = () => {
    onSave({
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : null,
      entry_type: entryType,
      property_id: entryType === 'property' ? propertyId : null,
      activity_type: entryType === 'property' ? activityType : null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zeiteintrag bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Entry Type */}
          <div className="space-y-2">
            <Label>Eintragstyp</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as TimeEntryType)}>
              <SelectTrigger>
                <span>
                  {entryType === 'property' ? 'Liegenschaft' : entryType === 'travel' ? 'Fahrzeit' : 'Pause'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="property">Liegenschaft</SelectItem>
                <SelectItem value="travel">Fahrzeit</SelectItem>
                <SelectItem value="break">Pause</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Property (only for property type) */}
          {entryType === 'property' && (
            <>
              <div className="space-y-2">
                <Label>Liegenschaft</Label>
                <Select
                  value={propertyId || ''}
                  onValueChange={(v) => setPropertyId(v || null)}
                >
                  <SelectTrigger>
                    <span className={!propertyId ? 'text-muted-foreground' : ''}>
                      {propertyId
                        ? properties.find(p => p.id === propertyId)?.name || 'Liegenschaft wählen...'
                        : 'Liegenschaft wählen...'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tätigkeit</Label>
                <Select
                  value={activityType || ''}
                  onValueChange={(v) => setActivityType((v as ActivityType) || null)}
                >
                  <SelectTrigger>
                    <span className={!activityType ? 'text-muted-foreground' : ''}>
                      {activityType
                        ? activityType === 'hauswartung' ? 'Hauswartung'
                          : activityType === 'rasen_maehen' ? 'Rasen mähen'
                          : activityType === 'hecken_schneiden' ? 'Hecken schneiden'
                          : 'Regie'
                        : 'Tätigkeit wählen...'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hauswartung">Hauswartung</SelectItem>
                    <SelectItem value="rasen_maehen">Rasen mähen</SelectItem>
                    <SelectItem value="hecken_schneiden">Hecken schneiden</SelectItem>
                    <SelectItem value="regie">Regie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Start Time */}
          <div className="space-y-2">
            <Label>Startzeit</Label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label>Endzeit</Label>
            <Input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notizen</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionale Notizen..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Speichern...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

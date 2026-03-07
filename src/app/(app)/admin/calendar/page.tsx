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
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { swissFormat, getDateFnsLocale } from '@/lib/i18n';
import { useTranslations } from 'next-intl';
import { useLocale } from '@/hooks/use-locale';
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
import { ErrorBoundary } from '@/components/error-boundary';
import type { Profile, TimeEntry, WorkDay, Property, ActivityType, TimeEntryType, PropertyType } from '@/types/database';

type ViewMode = 'day' | 'week' | 'month';

interface TimeEntryWithProperty extends TimeEntry {
  property?: Property | null;
}

interface WorkDayWithEntries extends WorkDay {
  time_entries: TimeEntryWithProperty[];
}

// Property types that only allow "Reinigung" activity
const CLEANING_ONLY_PROPERTY_TYPES: PropertyType[] = ['office', 'private_maintenance'];

// Activity type display configuration (icons/colors only, labels via i18n)
const ACTIVITY_CONFIG: Record<ActivityType, { labelKey: string; icon: typeof Wrench; color: string }> = {
  hauswartung: { labelKey: 'activities.hauswartung', icon: Wrench, color: 'text-blue-600 bg-blue-50' },
  rasen_maehen: { labelKey: 'activities.rasen_maehen', icon: Trees, color: 'text-green-600 bg-green-50' },
  hecken_schneiden: { labelKey: 'activities.hecken_schneiden', icon: Scissors, color: 'text-emerald-600 bg-emerald-50' },
  regie: { labelKey: 'activities.regie', icon: ClipboardList, color: 'text-purple-600 bg-purple-50' },
  reinigung: { labelKey: 'activities.reinigung', icon: Sparkles, color: 'text-cyan-600 bg-cyan-50' },
};

// Entry type display configuration (icons/colors only, labels via i18n)
const ENTRY_TYPE_CONFIG: Record<TimeEntryType, { labelKey: string; icon: typeof Car; color: string }> = {
  property: { labelKey: 'entryTypes.property', icon: Building2, color: 'text-primary-600 bg-primary-50' },
  travel: { labelKey: 'entryTypes.travel', icon: Car, color: 'text-amber-600 bg-amber-50' },
  break: { labelKey: 'entryTypes.break', icon: Coffee, color: 'text-orange-600 bg-orange-50' },
  vacation: { labelKey: 'entryTypes.vacation', icon: Palmtree, color: 'text-green-600 bg-green-50' },
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
  return (
    <ErrorBoundary>
      <CalendarPageContent />
    </ErrorBoundary>
  );
}

function CalendarPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);
  const { locale } = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale as any);
  const tCal = useTranslations('calendar');
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithProperty | null>(null);
  const [showNewEntryDialog, setShowNewEntryDialog] = useState(false);
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
      toast.success(tCal('entryUpdated'));
      queryClient.invalidateQueries({ queryKey: ['calendar-work-days'] });
      setEditingEntry(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || tCal('errorUpdating'));
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
      toast.success(tCal('entryDeleted'));
      queryClient.invalidateQueries({ queryKey: ['calendar-work-days'] });
    },
    onError: (error: any) => {
      toast.error(error.message || tCal('errorDeleting'));
    },
  });

  // Create time entry mutation
  type CreateEntryInput = {
    date: Date;
    entry_type: TimeEntryType;
    property_id: string | null;
    activity_type: ActivityType | null;
    start_time: string;
    end_time: string;
    notes: string | null;
  };

  const createEntryMutation = useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      if (!selectedUserId) throw new Error(tCal('noUserSelected'));
      const supabase = getClient();
      const dateStr = format(input.date, 'yyyy-MM-dd');

      // Find or create work day
      const { data: existingWorkDay } = await supabase
        .from('work_days')
        .select('id')
        .eq('user_id', selectedUserId)
        .eq('date', dateStr)
        .maybeSingle() as { data: { id: string } | null };

      let workDayId: string;
      if (existingWorkDay) {
        workDayId = existingWorkDay.id;
      } else {
        const { data: newWorkDay, error: wdError } = await (supabase
          .from('work_days') as any)
          .insert({ user_id: selectedUserId, date: dateStr, start_time: input.start_time, organization_id: organizationId })
          .select()
          .single();
        if (wdError) throw wdError;
        workDayId = newWorkDay.id;
      }

      // Insert time entry
      const { error } = await (supabase
        .from('time_entries') as any)
        .insert({
          work_day_id: workDayId,
          user_id: selectedUserId,
          entry_type: input.entry_type,
          property_id: input.entry_type === 'property' ? input.property_id : null,
          activity_type: input.entry_type === 'property' ? input.activity_type : null,
          start_time: input.start_time,
          end_time: input.end_time,
          status: 'completed',
          pause_duration: 0,
          notes: input.notes,
          organization_id: organizationId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tCal('entryCreated'));
      queryClient.invalidateQueries({ queryKey: ['calendar-work-days'] });
      setShowNewEntryDialog(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || tCal('errorCreating'));
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
    toast.success(tCal('calendarRefreshed'));
  };

  // Get title for current view
  const getViewTitle = () => {
    if (viewMode === 'day') {
      return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: dateFnsLocale });
    } else if (viewMode === 'week') {
      return `${format(dateRange.start, 'd. MMM', { locale: dateFnsLocale })} - ${format(dateRange.end, 'd. MMM yyyy', { locale: dateFnsLocale })}`;
    } else {
      return format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale });
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
        header={<Header title={tCal('title')} subtitle={tCal('noPermission')} />}
      >
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {tCal('noPermissionMessage')}
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      header={
        <Header
          title={tCal('title')}
          subtitle={tCal('subtitle')}
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
              <Label className="mb-2 block text-sm">{tCal('user')}</Label>
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
                        return user ? `${user.first_name} ${user.last_name}` : tCal('selectUser');
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{tCal('selectUser')}</span>
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
                {tCal('day')}
              </Button>
              <Button
                variant={viewMode === 'week' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('week')}
              >
                {tCal('week')}
              </Button>
              <Button
                variant={viewMode === 'month' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('month')}
              >
                {tCal('month')}
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
                {tCal('today')}
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
            <p>{tCal('selectUserPrompt')}</p>
          </CardContent>
        </Card>
      ) : viewMode === 'day' ? (
        <DayView
          date={currentDate}
          entries={getEntriesForDay(currentDate)}
          onEditEntry={setEditingEntry}
          onDeleteEntry={(entry) => {
            if (entry.entry_type === 'vacation') { toast.error(tCal('vacationManageNote')); return; }
            deleteEntryMutation.mutate(entry.id);
          }}
          onAddEntry={() => setShowNewEntryDialog(true)}
        />
      ) : viewMode === 'week' ? (
        <WeekView
          startDate={dateRange.start}
          workDays={workDaysData}
          onEditEntry={setEditingEntry}
          onDeleteEntry={(entry) => {
            if (entry.entry_type === 'vacation') { toast.error(tCal('vacationManageNote')); return; }
            deleteEntryMutation.mutate(entry.id);
          }}
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

      {/* New Entry Dialog */}
      {showNewEntryDialog && selectedUserId && (
        <NewEntryDialog
          date={currentDate}
          properties={properties}
          onClose={() => setShowNewEntryDialog(false)}
          onSave={(input) => createEntryMutation.mutate(input)}
          isLoading={createEntryMutation.isPending}
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
  onAddEntry?: () => void;
}

function DayView({ date, entries, onEditEntry, onDeleteEntry, onAddEntry }: DayViewProps) {
  const tCal = useTranslations('calendar');
  const { locale } = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale as any);
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
            {format(date, 'EEEE, d. MMMM yyyy', { locale: dateFnsLocale })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {tCal('total')}: {formatDuration(totalTime)}
            </span>
            {onAddEntry && (
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={onAddEntry}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedEntries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {tCal('noEntriesForDay')}
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
  const tCal = useTranslations('calendar');
  const { locale } = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale as any);
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
                  {format(day, 'EEEE, d. MMM', { locale: dateFnsLocale })}
                  {isToday && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                      {tCal('today')}
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
                      {tCal('moreEntries', { count: entries.length - 3 })}
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
  const tCal = useTranslations('calendar');
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = [
    tCal('weekDays.mo'), tCal('weekDays.tu'), tCal('weekDays.we'),
    tCal('weekDays.th'), tCal('weekDays.fr'), tCal('weekDays.sa'), tCal('weekDays.su')
  ];

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
  const tCal = useTranslations('calendar');
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
                : tCal(entryConfig.labelKey)}
            </span>
            {activityConfig && ActivityIcon && (
              <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full', activityConfig.color)}>
                <ActivityIcon className="h-3 w-3" />
                {tCal(activityConfig.labelKey)}
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
          {entry.entry_type !== 'vacation' ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteConfirm(true)}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <span className="text-[10px] text-muted-foreground w-8 text-center">{tCal('entryTypes.vacation')}</span>
          )}
        </div>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tCal('deleteEntryTitle')}</DialogTitle>
            <DialogDescription>
              {tCal('deleteEntryDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              {tCal('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete();
              }}
            >
              {tCal('delete')}
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
  const tCal = useTranslations('calendar');
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
          : tCal(entryConfig.labelKey)}
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
  const tCal = useTranslations('calendar');
  const isVacation = entry.entry_type === 'vacation';
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

  // Property-type-aware activity filtering (same logic as NewEntryDialog)
  const selectedProperty = propertyId ? properties.find(p => p.id === propertyId) : null;
  const isCleaningOnly = selectedProperty && CLEANING_ONLY_PROPERTY_TYPES.includes(selectedProperty.type);

  const availableActivities: { value: ActivityType; labelKey: string }[] = isCleaningOnly
    ? [{ value: 'reinigung', labelKey: 'activities.reinigung' }]
    : [
        { value: 'hauswartung', labelKey: 'activities.hauswartung' },
        { value: 'rasen_maehen', labelKey: 'activities.rasen_maehen' },
        { value: 'hecken_schneiden', labelKey: 'activities.hecken_schneiden' },
        { value: 'regie', labelKey: 'activities.regie' },
      ];

  const handlePropertyChange = (newPropertyId: string | null) => {
    setPropertyId(newPropertyId);
    const newProperty = newPropertyId ? properties.find(p => p.id === newPropertyId) : null;
    const newIsCleaningOnly = newProperty && CLEANING_ONLY_PROPERTY_TYPES.includes(newProperty.type);
    if (newIsCleaningOnly) {
      setActivityType('reinigung');
    } else if (activityType === 'reinigung') {
      setActivityType(null);
    }
  };

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

  // Read-only view for vacation entries
  if (isVacation) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tCal('vacationEntry')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-sm text-green-800">
              <p><span className="font-medium">{tCal('startTimeLabel')}:</span> {format(parseISO(entry.start_time), 'dd.MM.yyyy HH:mm')}</p>
              <p><span className="font-medium">{tCal('endTimeLabel')}:</span> {entry.end_time ? format(parseISO(entry.end_time), 'dd.MM.yyyy HH:mm') : '–'}</p>
              <p><span className="font-medium">{tCal('durationLabel')}:</span> {formatDuration(calculateDuration(entry))}</p>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {tCal('vacationManageNote')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {tCal('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tCal('editTimeEntry')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Entry Type */}
          <div className="space-y-2">
            <Label>{tCal('entryType')}</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as TimeEntryType)}>
              <SelectTrigger>
                <span>{tCal(ENTRY_TYPE_CONFIG[entryType]?.labelKey ?? entryType)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="property">{tCal('entryTypes.property')}</SelectItem>
                <SelectItem value="travel">{tCal('entryTypes.travel')}</SelectItem>
                <SelectItem value="break">{tCal('entryTypes.break')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Property (only for property type) */}
          {entryType === 'property' && (
            <>
              <div className="space-y-2">
                <Label>{tCal('entryTypes.property')}</Label>
                <Select
                  value={propertyId || ''}
                  onValueChange={(v) => handlePropertyChange(v || null)}
                >
                  <SelectTrigger>
                    <span className={!propertyId ? 'text-muted-foreground' : ''}>
                      {propertyId
                        ? properties.find(p => p.id === propertyId)?.name || tCal('selectProperty')
                        : tCal('selectProperty')}
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
                <Label>{tCal('activityLabel')}</Label>
                <Select
                  value={activityType || ''}
                  onValueChange={(v) => setActivityType((v as ActivityType) || null)}
                >
                  <SelectTrigger>
                    <span className={!activityType ? 'text-muted-foreground' : ''}>
                      {activityType
                        ? tCal(availableActivities.find(a => a.value === activityType)?.labelKey || 'selectActivity')
                        : tCal('selectActivity')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableActivities.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        {tCal(activity.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Start Time */}
          <div className="space-y-2">
            <Label>{tCal('startTimeLabel')}</Label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label>{tCal('endTimeLabel')}</Label>
            <Input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{tCal('notes')}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tCal('optionalNotes')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCal('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? tCal('saving') : tCal('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// New Entry Dialog
interface NewEntryDialogProps {
  date: Date;
  properties: Property[];
  onClose: () => void;
  onSave: (input: {
    date: Date;
    entry_type: TimeEntryType;
    property_id: string | null;
    activity_type: ActivityType | null;
    start_time: string;
    end_time: string;
    notes: string | null;
  }) => void;
  isLoading: boolean;
}

function NewEntryDialog({ date, properties, onClose, onSave, isLoading }: NewEntryDialogProps) {
  const tCal = useTranslations('calendar');
  const { locale } = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale as any);
  const dateStr = format(date, 'yyyy-MM-dd');
  const [entryType, setEntryType] = useState<TimeEntryType>('property');
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [startTime, setStartTime] = useState(`${dateStr}T08:00`);
  const [endTime, setEndTime] = useState(`${dateStr}T09:00`);
  const [notes, setNotes] = useState('');

  // Get selected property's type for activity filtering
  const selectedProperty = propertyId ? properties.find(p => p.id === propertyId) : null;
  const isCleaningOnly = selectedProperty && CLEANING_ONLY_PROPERTY_TYPES.includes(selectedProperty.type);

  // Available activities based on selected property
  const availableActivities: { value: ActivityType; labelKey: string }[] = isCleaningOnly
    ? [{ value: 'reinigung', labelKey: 'activities.reinigung' }]
    : [
        { value: 'hauswartung', labelKey: 'activities.hauswartung' },
        { value: 'rasen_maehen', labelKey: 'activities.rasen_maehen' },
        { value: 'hecken_schneiden', labelKey: 'activities.hecken_schneiden' },
        { value: 'regie', labelKey: 'activities.regie' },
      ];

  // Reset activity when property changes and current activity is no longer available
  const handlePropertyChange = (newPropertyId: string | null) => {
    setPropertyId(newPropertyId);
    const newProperty = newPropertyId ? properties.find(p => p.id === newPropertyId) : null;
    const newIsCleaningOnly = newProperty && CLEANING_ONLY_PROPERTY_TYPES.includes(newProperty.type);
    if (newIsCleaningOnly) {
      setActivityType('reinigung');
    } else if (activityType === 'reinigung') {
      setActivityType(null);
    }
  };

  const canSave = () => {
    if (!startTime || !endTime) return false;
    if (new Date(endTime) <= new Date(startTime)) return false;
    if (entryType === 'property' && (!propertyId || !activityType)) return false;
    return true;
  };

  const handleSave = () => {
    if (!canSave()) return;
    onSave({
      date,
      entry_type: entryType,
      property_id: entryType === 'property' ? propertyId : null,
      activity_type: entryType === 'property' ? activityType : null,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      notes: notes || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tCal('newTimeEntry')}</DialogTitle>
          <DialogDescription>
            {format(date, 'EEEE, d. MMMM yyyy', { locale: dateFnsLocale })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Entry Type */}
          <div className="space-y-2">
            <Label>{tCal('entryType')}</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as TimeEntryType)}>
              <SelectTrigger>
                <span>{tCal(ENTRY_TYPE_CONFIG[entryType]?.labelKey ?? entryType)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="property">{tCal('entryTypes.property')}</SelectItem>
                <SelectItem value="travel">{tCal('entryTypes.travel')}</SelectItem>
                <SelectItem value="break">{tCal('entryTypes.break')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Property (only for property type) */}
          {entryType === 'property' && (
            <>
              <div className="space-y-2">
                <Label>{tCal('entryTypes.property')}</Label>
                <Select
                  value={propertyId || ''}
                  onValueChange={(v) => handlePropertyChange(v || null)}
                >
                  <SelectTrigger>
                    <span className={!propertyId ? 'text-muted-foreground' : ''}>
                      {propertyId
                        ? properties.find(p => p.id === propertyId)?.name || tCal('selectProperty')
                        : tCal('selectProperty')}
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
                <Label>{tCal('activityLabel')}</Label>
                <Select
                  value={activityType || ''}
                  onValueChange={(v) => setActivityType((v as ActivityType) || null)}
                >
                  <SelectTrigger>
                    <span className={!activityType ? 'text-muted-foreground' : ''}>
                      {activityType
                        ? tCal(availableActivities.find(a => a.value === activityType)?.labelKey || 'selectActivity')
                        : tCal('selectActivity')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableActivities.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        {tCal(activity.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Start Time */}
          <div className="space-y-2">
            <Label>{tCal('startTimeLabel')}</Label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label>{tCal('endTimeLabel')}</Label>
            <Input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{tCal('notes')}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tCal('optionalNotes')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCal('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !canSave()}>
            {isLoading ? tCal('creating') : tCal('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

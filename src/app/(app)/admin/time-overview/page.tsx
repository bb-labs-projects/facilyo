'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import {
  Clock,
  Download,
  ChevronLeft,
  ChevronRight,
  User,
  Car,
  Coffee,
  Building2,
  Filter,
  X,
  Wrench,
  Trees,
  Scissors,
  ClipboardList,
  Sparkles,
  BarChart3,
  Users,
  TrendingUp,
  Palmtree,
} from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  differenceInSeconds,
  parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { ErrorBoundary } from '@/components/error-boundary';
import type { Profile, TimeEntry, WorkDay, Property, ActivityType, TimeEntryType } from '@/types/database';
// xlsx is dynamically imported in handleExportXLSX to avoid loading ~90KB upfront

type ViewMode = 'daily' | 'weekly' | 'monthly';

interface TimeEntryWithProperty extends TimeEntry {
  property?: {
    id: string;
    name: string;
  } | null;
}

interface WorkDayWithEntries extends WorkDay {
  time_entries: TimeEntryWithProperty[];
}

// Activity type display configuration
const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: typeof Wrench; color: string }> = {
  hauswartung: { label: 'Hauswartung', icon: Wrench, color: 'text-blue-600' },
  rasen_maehen: { label: 'Rasen mähen', icon: Trees, color: 'text-green-600' },
  hecken_schneiden: { label: 'Hecken schneiden', icon: Scissors, color: 'text-emerald-600' },
  regie: { label: 'Regie', icon: ClipboardList, color: 'text-purple-600' },
  reinigung: { label: 'Reinigung', icon: Sparkles, color: 'text-cyan-600' },
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDurationForExport(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function calculateEntryDuration(entry: TimeEntry): number {
  if (!entry.start_time) return 0;
  const start = parseISO(entry.start_time);
  const end = entry.end_time ? parseISO(entry.end_time) : new Date();
  const duration = differenceInSeconds(end, start);
  const pauseDuration = entry.pause_duration || 0;
  return Math.max(0, duration - pauseDuration);
}

export default function TimeOverviewPage() {
  return (
    <ErrorBoundary>
      <TimeOverviewPageContent />
    </ErrorBoundary>
  );
}

function TimeOverviewPageContent() {
  const router = useRouter();
  const permissions = usePermissions();
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filter states
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedActivityType, setSelectedActivityType] = useState<ActivityType | null>(null);
  const [selectedEntryType, setSelectedEntryType] = useState<TimeEntryType | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const dateRange = useMemo(() => {
    if (viewMode === 'daily') {
      return {
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
      };
    } else if (viewMode === 'weekly') {
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

  const dateRangeLabel = useMemo(() => {
    if (viewMode === 'daily') {
      return format(dateRange.start, 'EEEE, dd. MMMM yyyy', { locale: de });
    } else if (viewMode === 'weekly') {
      const start = format(dateRange.start, 'dd.MM.', { locale: de });
      const end = format(dateRange.end, 'dd.MM.yyyy', { locale: de });
      return `KW ${format(dateRange.start, 'w', { locale: de })} (${start} - ${end})`;
    } else {
      return format(dateRange.start, 'MMMM yyyy', { locale: de });
    }
  }, [viewMode, dateRange]);

  // Fetch employees, properties, and work days in parallel for better performance
  const [employeesQuery, propertiesQuery, workDaysQuery] = useQueries({
    queries: [
      {
        queryKey: ['all-employees'],
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
      },
      {
        queryKey: ['all-properties'],
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
      },
      {
        queryKey: ['admin-time-overview', format(dateRange.start, 'yyyy-MM-dd'), format(dateRange.end, 'yyyy-MM-dd')],
        queryFn: async () => {
          const supabase = getClient();
          const { data, error } = await supabase
            .from('work_days')
            .select(`
              *,
              time_entries (
                *,
                property:properties (id, name)
              )
            `)
            .gte('date', format(dateRange.start, 'yyyy-MM-dd'))
            .lte('date', format(dateRange.end, 'yyyy-MM-dd'))
            .order('date', { ascending: false });

          if (error) throw error;
          return data as WorkDayWithEntries[];
        },
      },
    ],
  });

  const employees = employeesQuery.data ?? [];
  const properties = propertiesQuery.data ?? [];
  const workDaysData = workDaysQuery.data ?? [];
  const isLoading = workDaysQuery.isLoading;

  // Filter entries based on selected filters
  const filteredEntries = useMemo(() => {
    const allEntries: (TimeEntryWithProperty & { userId: string })[] = [];

    workDaysData.forEach((workDay) => {
      workDay.time_entries?.forEach((entry) => {
        // Apply employee filter
        if (selectedEmployeeId && workDay.user_id !== selectedEmployeeId) return;

        // Apply property filter
        if (selectedPropertyId && entry.property_id !== selectedPropertyId) return;

        // Apply activity type filter
        if (selectedActivityType && entry.activity_type !== selectedActivityType) return;

        // Apply entry type filter
        if (selectedEntryType && entry.entry_type !== selectedEntryType) return;

        allEntries.push({ ...entry, userId: workDay.user_id });
      });
    });

    return allEntries;
  }, [workDaysData, selectedEmployeeId, selectedPropertyId, selectedActivityType, selectedEntryType]);

  // Calculate totals from filtered entries
  const totals = useMemo(() => {
    let propertyTime = 0;
    let travelTime = 0;
    let breakTime = 0;
    let vacationTime = 0;

    filteredEntries.forEach((entry) => {
      const duration = calculateEntryDuration(entry);
      switch (entry.entry_type) {
        case 'property':
          propertyTime += duration;
          break;
        case 'travel':
          travelTime += duration;
          break;
        case 'break':
          breakTime += duration;
          break;
        case 'vacation':
          vacationTime += duration;
          break;
      }
    });

    return {
      propertyTime,
      travelTime,
      breakTime,
      vacationTime,
      workTime: propertyTime + travelTime,
    };
  }, [filteredEntries]);

  // Pre-build lookup maps for O(1) access
  const employeeMap = useMemo(() => {
    const map = new Map<string, Profile>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const entryToWorkDayMap = useMemo(() => {
    const map = new Map<string, WorkDayWithEntries>();
    workDaysData.forEach((wd) => {
      wd.time_entries?.forEach((te) => map.set(te.id, wd));
    });
    return map;
  }, [workDaysData]);

  // Group data by employee
  const employeeStats = useMemo(() => {
    const stats = new Map<string, { name: string; propertyTime: number; travelTime: number; breakTime: number; vacationTime: number; workDays: Set<string> }>();

    filteredEntries.forEach((entry) => {
      const employee = employeeMap.get(entry.userId);
      if (!employee) return;

      const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email;

      if (!stats.has(entry.userId)) {
        stats.set(entry.userId, { name, propertyTime: 0, travelTime: 0, breakTime: 0, vacationTime: 0, workDays: new Set() });
      }

      const stat = stats.get(entry.userId)!;
      const duration = calculateEntryDuration(entry);

      // Track work day
      const workDay = entryToWorkDayMap.get(entry.id);
      if (workDay) stat.workDays.add(workDay.date);

      switch (entry.entry_type) {
        case 'property':
          stat.propertyTime += duration;
          break;
        case 'travel':
          stat.travelTime += duration;
          break;
        case 'break':
          stat.breakTime += duration;
          break;
        case 'vacation':
          stat.vacationTime += duration;
          break;
      }
    });

    return Array.from(stats.entries())
      .map(([id, stat]) => ({ id, ...stat, workDays: stat.workDays.size }))
      .sort((a, b) => (b.propertyTime + b.travelTime) - (a.propertyTime + a.travelTime));
  }, [filteredEntries, employeeMap, entryToWorkDayMap]);

  // Group data by property
  const propertyStats = useMemo(() => {
    const stats = new Map<string, { name: string; totalTime: number; activities: Map<ActivityType, number> }>();

    filteredEntries.forEach((entry) => {
      if (entry.entry_type !== 'property' || !entry.property_id) return;

      const propertyName = entry.property?.name || 'Unbekannt';

      if (!stats.has(entry.property_id)) {
        stats.set(entry.property_id, { name: propertyName, totalTime: 0, activities: new Map() });
      }

      const stat = stats.get(entry.property_id)!;
      const duration = calculateEntryDuration(entry);
      stat.totalTime += duration;

      if (entry.activity_type) {
        const currentActivity = stat.activities.get(entry.activity_type) || 0;
        stat.activities.set(entry.activity_type, currentActivity + duration);
      }
    });

    return Array.from(stats.entries())
      .map(([id, stat]) => ({ id, ...stat, activities: Array.from(stat.activities.entries()) }))
      .sort((a, b) => b.totalTime - a.totalTime);
  }, [filteredEntries]);

  // Group data by activity
  const activityStats = useMemo(() => {
    const stats = new Map<ActivityType, number>();

    filteredEntries.forEach((entry) => {
      if (entry.entry_type !== 'property' || !entry.activity_type) return;

      const duration = calculateEntryDuration(entry);
      const current = stats.get(entry.activity_type) || 0;
      stats.set(entry.activity_type, current + duration);
    });

    return Array.from(stats.entries())
      .map(([type, time]) => ({ type, time, ...ACTIVITY_CONFIG[type] }))
      .sort((a, b) => b.time - a.time);
  }, [filteredEntries]);

  const handlePrevious = () => {
    if (viewMode === 'daily') {
      setCurrentDate(subDays(currentDate, 1));
    } else if (viewMode === 'weekly') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'daily') {
      setCurrentDate(addDays(currentDate, 1));
    } else if (viewMode === 'weekly') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const clearFilters = () => {
    setSelectedEmployeeId(null);
    setSelectedPropertyId(null);
    setSelectedActivityType(null);
    setSelectedEntryType(null);
  };

  const activeFilterCount = [selectedEmployeeId, selectedPropertyId, selectedActivityType, selectedEntryType].filter(Boolean).length;

  const handleExportXLSX = async () => {
    const XLSX = await import('xlsx');
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Activity type keys for columns
    const activityKeys = Object.keys(ACTIVITY_CONFIG) as ActivityType[];

    // Build detailed daily data per employee
    const dailyData: Array<{
      Mitarbeiter: string;
      Datum: string;
      Wochentag: string;
      [key: string]: string | number;
    }> = [];

    // Group entries by employee and date
    const employeeDailyStats = new Map<string, Map<string, {
      activities: Map<ActivityType, number>;
      travel: number;
      break_time: number;
      vacation: number;
    }>>();

    filteredEntries.forEach((entry) => {
      const employee = employeeMap.get(entry.userId);
      if (!employee) return;

      const workDay = entryToWorkDayMap.get(entry.id);
      if (!workDay) return;

      const employeeId = entry.userId;
      const date = workDay.date;

      if (!employeeDailyStats.has(employeeId)) {
        employeeDailyStats.set(employeeId, new Map());
      }

      const employeeDays = employeeDailyStats.get(employeeId)!;
      if (!employeeDays.has(date)) {
        employeeDays.set(date, {
          activities: new Map(),
          travel: 0,
          break_time: 0,
          vacation: 0,
        });
      }

      const dayStats = employeeDays.get(date)!;
      const duration = calculateEntryDuration(entry);

      switch (entry.entry_type) {
        case 'property':
          if (entry.activity_type) {
            const current = dayStats.activities.get(entry.activity_type) || 0;
            dayStats.activities.set(entry.activity_type, current + duration);
          }
          break;
        case 'travel':
          dayStats.travel += duration;
          break;
        case 'break':
          dayStats.break_time += duration;
          break;
        case 'vacation':
          dayStats.vacation += duration;
          break;
      }
    });

    // Convert to export format and calculate employee totals
    const employeeTotals = new Map<string, {
      name: string;
      activities: Map<ActivityType, number>;
      travel: number;
      break_time: number;
      vacation: number;
    }>();

    employeeDailyStats.forEach((days, employeeId) => {
      const employee = employeeMap.get(employeeId);
      const employeeName = employee
        ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email
        : 'Unbekannt';

      // Initialize totals for this employee
      if (!employeeTotals.has(employeeId)) {
        employeeTotals.set(employeeId, {
          name: employeeName,
          activities: new Map(),
          travel: 0,
          break_time: 0,
          vacation: 0,
        });
      }
      const empTotal = employeeTotals.get(employeeId)!;

      // Sort days by date
      const sortedDays = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      sortedDays.forEach(([date, stats]) => {
        const parsedDate = parseISO(date);
        const dayOfWeek = format(parsedDate, 'EEEE', { locale: de });
        const formattedDate = format(parsedDate, 'dd.MM.yyyy', { locale: de });

        // Calculate day total (activities + travel)
        let dayPropertyTotal = 0;
        stats.activities.forEach((time) => {
          dayPropertyTotal += time;
        });
        const dayTotal = dayPropertyTotal + stats.travel;

        // Build row with activities as columns
        const row: Record<string, string | number> = {
          'Mitarbeiter': employeeName,
          'Datum': formattedDate,
          'Wochentag': dayOfWeek,
        };

        // Add activity columns
        activityKeys.forEach((activityType) => {
          const time = stats.activities.get(activityType) || 0;
          row[ACTIVITY_CONFIG[activityType].label] = time > 0 ? formatDurationForExport(time) : '';

          // Add to employee total
          const currentTotal = empTotal.activities.get(activityType) || 0;
          empTotal.activities.set(activityType, currentTotal + time);
        });

        row['Fahrtzeit'] = stats.travel > 0 ? formatDurationForExport(stats.travel) : '';
        row['Pause'] = stats.break_time > 0 ? formatDurationForExport(stats.break_time) : '';
        row['Ferien'] = stats.vacation > 0 ? formatDurationForExport(stats.vacation) : '';
        row['Tagesgesamt'] = formatDurationForExport(dayTotal);

        // Add to employee totals
        empTotal.travel += stats.travel;
        empTotal.break_time += stats.break_time;
        empTotal.vacation += stats.vacation;

        dailyData.push(row as typeof dailyData[0]);
      });

      // Add employee total row
      let empPropertyTotal = 0;
      const totalRow: Record<string, string | number> = {
        'Mitarbeiter': `${employeeName} - GESAMT`,
        'Datum': '',
        'Wochentag': '',
      };

      activityKeys.forEach((activityType) => {
        const time = empTotal.activities.get(activityType) || 0;
        totalRow[ACTIVITY_CONFIG[activityType].label] = time > 0 ? formatDurationForExport(time) : '';
        empPropertyTotal += time;
      });

      totalRow['Fahrtzeit'] = empTotal.travel > 0 ? formatDurationForExport(empTotal.travel) : '';
      totalRow['Pause'] = empTotal.break_time > 0 ? formatDurationForExport(empTotal.break_time) : '';
      totalRow['Ferien'] = empTotal.vacation > 0 ? formatDurationForExport(empTotal.vacation) : '';
      totalRow['Tagesgesamt'] = formatDurationForExport(empPropertyTotal + empTotal.travel);

      dailyData.push(totalRow as typeof dailyData[0]);

      // Add empty row between employees
      dailyData.push({
        'Mitarbeiter': '',
        'Datum': '',
        'Wochentag': '',
      } as typeof dailyData[0]);
    });

    // Daily details sheet
    if (dailyData.length > 0) {
      const wsDaily = XLSX.utils.json_to_sheet(dailyData);
      // Set column widths
      wsDaily['!cols'] = [
        { wch: 25 }, // Mitarbeiter
        { wch: 12 }, // Datum
        { wch: 12 }, // Wochentag
        ...activityKeys.map(() => ({ wch: 14 })), // Activity columns
        { wch: 10 }, // Fahrtzeit
        { wch: 10 }, // Pause
        { wch: 10 }, // Ferien
        { wch: 12 }, // Tagesgesamt
      ];
      XLSX.utils.book_append_sheet(wb, wsDaily, 'Tagesübersicht');
    }

    // Summary sheet (original format)
    const summaryData = employeeStats.map((stat) => ({
      'Mitarbeiter': stat.name,
      'Arbeitszeit (Liegenschaft)': formatDurationForExport(stat.propertyTime),
      'Fahrtzeit': formatDurationForExport(stat.travelTime),
      'Pausenzeit': formatDurationForExport(stat.breakTime),
      'Ferien': formatDurationForExport(stat.vacationTime),
      'Gesamtarbeitszeit': formatDurationForExport(stat.propertyTime + stat.travelTime),
      'Arbeitstage': stat.workDays,
    }));

    summaryData.push({
      'Mitarbeiter': 'GESAMT',
      'Arbeitszeit (Liegenschaft)': formatDurationForExport(totals.propertyTime),
      'Fahrtzeit': formatDurationForExport(totals.travelTime),
      'Pausenzeit': formatDurationForExport(totals.breakTime),
      'Ferien': formatDurationForExport(totals.vacationTime),
      'Gesamtarbeitszeit': formatDurationForExport(totals.workTime),
      'Arbeitstage': employeeStats.reduce((sum, d) => sum + d.workDays, 0),
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [
      { wch: 25 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Zusammenfassung');

    // Property sheet
    const propertyExport = propertyStats.map((stat) => ({
      'Liegenschaft': stat.name,
      'Gesamtzeit': formatDurationForExport(stat.totalTime),
      ...Object.fromEntries(stat.activities.map(([type, time]) => [ACTIVITY_CONFIG[type].label, formatDurationForExport(time)])),
    }));
    if (propertyExport.length > 0) {
      const wsProperties = XLSX.utils.json_to_sheet(propertyExport);
      XLSX.utils.book_append_sheet(wb, wsProperties, 'Liegenschaften');
    }

    // Activity sheet
    const activityExport = activityStats.map((stat) => ({
      'Aktivität': stat.label,
      'Gesamtzeit': formatDurationForExport(stat.time),
    }));
    if (activityExport.length > 0) {
      const wsActivities = XLSX.utils.json_to_sheet(activityExport);
      XLSX.utils.book_append_sheet(wb, wsActivities, 'Aktivitäten');
    }

    // Generate filename
    const filterSuffix = activeFilterCount > 0 ? '_gefiltert' : '';
    let filename: string;
    if (viewMode === 'daily') {
      filename = `Zeitübersicht_${format(dateRange.start, 'dd-MM-yyyy')}${filterSuffix}.xlsx`;
    } else if (viewMode === 'weekly') {
      filename = `Zeitübersicht_KW${format(dateRange.start, 'w')}_${format(dateRange.start, 'yyyy')}${filterSuffix}.xlsx`;
    } else {
      filename = `Zeitübersicht_${format(dateRange.start, 'MMMM_yyyy', { locale: de })}${filterSuffix}.xlsx`;
    }

    XLSX.writeFile(wb, filename);
  };

  // Redirect if no permission
  if (!permissions.canAccessAdminPanel) {
    router.push('/');
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title="Zeitübersicht"
          showBack
          rightElement={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(activeFilterCount > 0 && 'text-primary-600')}
              >
                <Filter className="h-5 w-5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary-600 text-[10px] text-white flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExportXLSX}
                disabled={filteredEntries.length === 0}
              >
                <Download className="h-5 w-5" />
              </Button>
            </div>
          }
        />
      }
    >
      {/* Filters Panel */}
      {showFilters && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </CardTitle>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Zurücksetzen
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Employee Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mitarbeiter</label>
              <select
                value={selectedEmployeeId || ''}
                onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Alle Mitarbeiter</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {`${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Property Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Liegenschaft</label>
              <select
                value={selectedPropertyId || ''}
                onChange={(e) => setSelectedPropertyId(e.target.value || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Alle Liegenschaften</option>
                {properties.map((prop) => (
                  <option key={prop.id} value={prop.id}>{prop.name}</option>
                ))}
              </select>
            </div>

            {/* Activity Type Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Aktivität</label>
              <select
                value={selectedActivityType || ''}
                onChange={(e) => setSelectedActivityType((e.target.value as ActivityType) || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Alle Aktivitäten</option>
                {Object.entries(ACTIVITY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>

            {/* Entry Type Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Eintragstyp</label>
              <select
                value={selectedEntryType || ''}
                onChange={(e) => setSelectedEntryType((e.target.value as TimeEntryType) || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Alle Typen</option>
                <option value="property">Liegenschaft</option>
                <option value="travel">Fahrzeit</option>
                <option value="break">Pause</option>
                <option value="vacation">Ferien</option>
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('daily')}
          className={cn(
            'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'daily'
              ? 'bg-primary-600 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          Täglich
        </button>
        <button
          onClick={() => setViewMode('weekly')}
          className={cn(
            'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'weekly'
              ? 'bg-primary-600 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          Wöchentlich
        </button>
        <button
          onClick={() => setViewMode('monthly')}
          className={cn(
            'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'monthly'
              ? 'bg-primary-600 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          Monatlich
        </button>
      </div>

      {/* Date Navigation */}
      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={handlePrevious}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <span className="font-medium">{dateRangeLabel}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNext}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card
          className={cn(
            'cursor-pointer transition-all hover:ring-2 hover:ring-primary-300',
            selectedEntryType === 'property' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setSelectedEntryType(selectedEntryType === 'property' ? null : 'property')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs">Arbeitszeit</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.propertyTime)}</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'cursor-pointer transition-all hover:ring-2 hover:ring-primary-300',
            selectedEntryType === 'travel' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setSelectedEntryType(selectedEntryType === 'travel' ? null : 'travel')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Car className="h-4 w-4" />
              <span className="text-xs">Fahrtzeit</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.travelTime)}</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'cursor-pointer transition-all hover:ring-2 hover:ring-primary-300',
            selectedEntryType === 'break' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setSelectedEntryType(selectedEntryType === 'break' ? null : 'break')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Coffee className="h-4 w-4" />
              <span className="text-xs">Pausen</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.breakTime)}</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'cursor-pointer transition-all hover:ring-2 hover:ring-primary-300',
            selectedEntryType === 'vacation' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setSelectedEntryType(selectedEntryType === 'vacation' ? null : 'vacation')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Palmtree className="h-4 w-4" />
              <span className="text-xs">Ferien</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.vacationTime)}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Gesamt</span>
            </div>
            <p className="text-lg font-semibold text-primary-600">{formatDuration(totals.workTime)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Zeiteinträge im ausgewählten Zeitraum</p>
          {activeFilterCount > 0 && (
            <Button variant="ghost" onClick={clearFilters} className="mt-2">
              Filter zurücksetzen
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Activity Breakdown */}
          {activityStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Nach Aktivität
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activityStats.map((stat) => {
                    const Icon = stat.icon;
                    const percentage = totals.propertyTime > 0 ? (stat.time / totals.propertyTime) * 100 : 0;
                    const isSelected = selectedActivityType === stat.type;
                    return (
                      <div
                        key={stat.type}
                        onClick={() => setSelectedActivityType(isSelected ? null : stat.type)}
                        className={cn(
                          'flex items-center gap-3 p-2 -mx-2 rounded-lg cursor-pointer transition-all',
                          isSelected
                            ? 'bg-primary-100 ring-2 ring-primary-500'
                            : 'hover:bg-muted'
                        )}
                      >
                        <Icon className={cn('h-4 w-4 flex-shrink-0', stat.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="truncate">{stat.label}</span>
                            <span className="font-medium">{formatDuration(stat.time)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Property Breakdown */}
          {propertyStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Nach Liegenschaft
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {propertyStats.slice(0, 10).map((stat) => {
                    const percentage = totals.propertyTime > 0 ? (stat.totalTime / totals.propertyTime) * 100 : 0;
                    const isSelected = selectedPropertyId === stat.id;
                    return (
                      <div
                        key={stat.id}
                        onClick={() => setSelectedPropertyId(isSelected ? null : stat.id)}
                        className={cn(
                          'p-2 -mx-2 rounded-lg cursor-pointer transition-all',
                          isSelected
                            ? 'bg-primary-100 ring-2 ring-primary-500'
                            : 'hover:bg-muted'
                        )}
                      >
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="truncate font-medium">{stat.name}</span>
                          <span className="text-muted-foreground">{formatDuration(stat.totalTime)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden mb-1">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        {stat.activities.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {stat.activities.map(([type, time]) => {
                              const config = ACTIVITY_CONFIG[type];
                              const Icon = config.icon;
                              return (
                                <span key={type} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Icon className={cn('h-3 w-3', config.color)} />
                                  {formatDuration(time)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {propertyStats.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{propertyStats.length - 10} weitere Liegenschaften
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Employee List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Nach Mitarbeiter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {employeeStats.map((stat) => {
                  const isSelected = selectedEmployeeId === stat.id;
                  return (
                    <div
                      key={stat.id}
                      onClick={() => setSelectedEmployeeId(isSelected ? null : stat.id)}
                      className={cn(
                        'flex items-start gap-3 p-2 -mx-2 rounded-lg cursor-pointer transition-all',
                        isSelected
                          ? 'bg-primary-100 ring-2 ring-primary-500'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium truncate text-sm">{stat.name}</h3>
                          <span className="text-sm font-semibold text-primary-600">
                            {formatDuration(stat.propertyTime + stat.travelTime)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {stat.workDays} Arbeitstage
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {formatDuration(stat.propertyTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3 text-muted-foreground" />
                            {formatDuration(stat.travelTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Coffee className="h-3 w-3 text-muted-foreground" />
                            {formatDuration(stat.breakTime)}
                          </span>
                          {stat.vacationTime > 0 && (
                            <span className="flex items-center gap-1">
                              <Palmtree className="h-3 w-3 text-muted-foreground" />
                              {formatDuration(stat.vacationTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

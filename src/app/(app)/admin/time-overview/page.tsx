'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  User,
  Car,
  Coffee,
  Building2,
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
  format,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  differenceInSeconds,
  parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';
import type { Profile, TimeEntry, WorkDay } from '@/types/database';
import * as XLSX from 'xlsx';

type ViewMode = 'weekly' | 'monthly';

interface TimeEntryWithProperty extends TimeEntry {
  property?: {
    id: string;
    name: string;
  } | null;
}

interface WorkDayWithEntries extends WorkDay {
  time_entries: TimeEntryWithProperty[];
}

interface EmployeeTimeData {
  profile: Profile;
  workDays: WorkDayWithEntries[];
  totalPropertyTime: number;
  totalTravelTime: number;
  totalBreakTime: number;
  totalWorkTime: number;
}

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
  const router = useRouter();
  const permissions = usePermissions();
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());

  const dateRange = useMemo(() => {
    if (viewMode === 'weekly') {
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
    if (viewMode === 'weekly') {
      const start = format(dateRange.start, 'dd.MM.', { locale: de });
      const end = format(dateRange.end, 'dd.MM.yyyy', { locale: de });
      return `KW ${format(dateRange.start, 'w', { locale: de })} (${start} - ${end})`;
    } else {
      return format(dateRange.start, 'MMMM yyyy', { locale: de });
    }
  }, [viewMode, dateRange]);

  // Fetch all employees
  const { data: employees = [] } = useQuery({
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
  });

  // Fetch work days with time entries for all employees in date range
  const { data: workDaysData = [], isLoading } = useQuery({
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
  });

  // Process data by employee
  const employeeTimeData: EmployeeTimeData[] = useMemo(() => {
    return employees.map((employee) => {
      const employeeWorkDays = workDaysData.filter((wd) => wd.user_id === employee.id);

      let totalPropertyTime = 0;
      let totalTravelTime = 0;
      let totalBreakTime = 0;

      employeeWorkDays.forEach((workDay) => {
        workDay.time_entries?.forEach((entry) => {
          const duration = calculateEntryDuration(entry);
          switch (entry.entry_type) {
            case 'property':
              totalPropertyTime += duration;
              break;
            case 'travel':
              totalTravelTime += duration;
              break;
            case 'break':
              totalBreakTime += duration;
              break;
          }
        });
      });

      return {
        profile: employee,
        workDays: employeeWorkDays,
        totalPropertyTime,
        totalTravelTime,
        totalBreakTime,
        totalWorkTime: totalPropertyTime + totalTravelTime,
      };
    }).filter((data) => data.workDays.length > 0 || data.totalWorkTime > 0);
  }, [employees, workDaysData]);

  // Calculate totals
  const totals = useMemo(() => {
    return employeeTimeData.reduce(
      (acc, data) => ({
        propertyTime: acc.propertyTime + data.totalPropertyTime,
        travelTime: acc.travelTime + data.totalTravelTime,
        breakTime: acc.breakTime + data.totalBreakTime,
        workTime: acc.workTime + data.totalWorkTime,
      }),
      { propertyTime: 0, travelTime: 0, breakTime: 0, workTime: 0 }
    );
  }, [employeeTimeData]);

  const handlePrevious = () => {
    if (viewMode === 'weekly') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'weekly') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const handleExportXLSX = () => {
    // Prepare data for export
    const exportData = employeeTimeData.map((data) => ({
      'Mitarbeiter': `${data.profile.first_name || ''} ${data.profile.last_name || ''}`.trim() || data.profile.email,
      'Arbeitszeit (Liegenschaft)': formatDurationForExport(data.totalPropertyTime),
      'Fahrtzeit': formatDurationForExport(data.totalTravelTime),
      'Pausenzeit': formatDurationForExport(data.totalBreakTime),
      'Gesamtarbeitszeit': formatDurationForExport(data.totalWorkTime),
      'Arbeitstage': data.workDays.length,
    }));

    // Add totals row
    exportData.push({
      'Mitarbeiter': 'GESAMT',
      'Arbeitszeit (Liegenschaft)': formatDurationForExport(totals.propertyTime),
      'Fahrtzeit': formatDurationForExport(totals.travelTime),
      'Pausenzeit': formatDurationForExport(totals.breakTime),
      'Gesamtarbeitszeit': formatDurationForExport(totals.workTime),
      'Arbeitstage': employeeTimeData.reduce((sum, d) => sum + d.workDays.length, 0),
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws['!cols'] = [
      { wch: 25 },
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Zeitübersicht');

    // Generate filename
    const filename = viewMode === 'weekly'
      ? `Zeitübersicht_KW${format(dateRange.start, 'w')}_${format(dateRange.start, 'yyyy')}.xlsx`
      : `Zeitübersicht_${format(dateRange.start, 'MMMM_yyyy', { locale: de })}.xlsx`;

    // Download
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
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportXLSX}
              disabled={employeeTimeData.length === 0}
            >
              <Download className="h-5 w-5" />
            </Button>
          }
        />
      }
    >
      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-4">
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
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs">Arbeitszeit</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.propertyTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Car className="h-4 w-4" />
              <span className="text-xs">Fahrtzeit</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.travelTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Coffee className="h-4 w-4" />
              <span className="text-xs">Pausen</span>
            </div>
            <p className="text-lg font-semibold">{formatDuration(totals.breakTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Gesamt</span>
            </div>
            <p className="text-lg font-semibold text-primary-600">{formatDuration(totals.workTime)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : employeeTimeData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Zeiteinträge im ausgewählten Zeitraum</p>
        </div>
      ) : (
        <div className="space-y-3">
          {employeeTimeData.map((data) => {
            const name = `${data.profile.first_name || ''} ${data.profile.last_name || ''}`.trim() || data.profile.email;
            return (
              <Card key={data.profile.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {data.workDays.length} Arbeitstage
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDuration(data.totalPropertyTime)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Car className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDuration(data.totalTravelTime)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDuration(data.totalBreakTime)}</span>
                        </div>
                        <div className="flex items-center gap-2 font-medium text-primary-600">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDuration(data.totalWorkTime)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

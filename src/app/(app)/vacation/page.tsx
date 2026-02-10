'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  FileText,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isWeekend,
  startOfWeek,
  endOfWeek,
  isSameDay,
  parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';
import type { VacationRequestWithUser, Profile } from '@/types/database';

const USER_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
];

type Tab = 'kalender' | 'saldo' | 'antraege';

export default function VacationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const { canManageVacations } = usePermissions();

  const [activeTab, setActiveTab] = useState<Tab>('kalender');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [rejectingRequest, setRejectingRequest] = useState<VacationRequestWithUser | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // ─── Calendar query: all approved + own pending for visible month ───
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: calendarRequests = [], refetch: refetchCalendar } = useQuery({
    queryKey: [
      'vacation-calendar',
      profile?.id,
      format(monthStart, 'yyyy-MM-dd'),
    ],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('vacation_requests')
        .select('*, user:profiles!vacation_requests_user_id_fkey(*)')
        .or(
          `status.eq.approved,and(user_id.eq.${profile!.id},status.eq.pending)`
        )
        .lte('start_date', format(monthEnd, 'yyyy-MM-dd'))
        .gte('end_date', format(monthStart, 'yyyy-MM-dd'));

      if (error) throw error;
      return data as VacationRequestWithUser[];
    },
    enabled: !!profile?.id,
  });

  // ─── Own requests for current year (saldo tab) ───
  const currentYear = new Date().getFullYear();

  const { data: ownRequests = [], refetch: refetchOwn } = useQuery({
    queryKey: ['vacation-own', profile?.id, currentYear],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('vacation_requests')
        .select('*, user:profiles!vacation_requests_user_id_fkey(*)')
        .eq('user_id', profile!.id)
        .gte('start_date', `${currentYear}-01-01`)
        .lte('start_date', `${currentYear}-12-31`)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data as VacationRequestWithUser[];
    },
    enabled: !!profile?.id,
  });

  // ─── All pending requests (admin tab) ───
  const { data: pendingRequests = [], refetch: refetchPending } = useQuery({
    queryKey: ['vacation-pending'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('vacation_requests')
        .select('*, user:profiles!vacation_requests_user_id_fkey(*)')
        .eq('status', 'pending')
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data as VacationRequestWithUser[];
    },
    enabled: !!profile?.id && canManageVacations,
  });

  // ─── All approved requests (admin tab) ───
  const { data: approvedRequests = [], refetch: refetchApproved } = useQuery({
    queryKey: ['vacation-approved', currentYear],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('vacation_requests')
        .select('*, user:profiles!vacation_requests_user_id_fkey(*)')
        .eq('status', 'approved')
        .gte('start_date', `${currentYear}-01-01`)
        .lte('start_date', `${currentYear}-12-31`)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data as VacationRequestWithUser[];
    },
    enabled: !!profile?.id && canManageVacations,
  });

  // ─── All rejected requests (admin tab) ───
  const { data: rejectedRequests = [], refetch: refetchRejected } = useQuery({
    queryKey: ['vacation-rejected', currentYear],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('vacation_requests')
        .select('*, user:profiles!vacation_requests_user_id_fkey(*)')
        .eq('status', 'rejected')
        .gte('start_date', `${currentYear}-01-01`)
        .lte('start_date', `${currentYear}-12-31`)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data as VacationRequestWithUser[];
    },
    enabled: !!profile?.id && canManageVacations,
  });

  // ─── Approve mutation ───
  const approveMutation = useMutation({
    mutationFn: async (request: VacationRequestWithUser) => {
      const supabase = getClient();

      // 1. Check request is still pending (duplicate click protection)
      const { data: current, error: checkError } = await (supabase as any)
        .from('vacation_requests')
        .select('status')
        .eq('id', request.id)
        .single();

      if (checkError) throw checkError;
      if (current.status !== 'pending') {
        throw new Error('Antrag wurde bereits bearbeitet');
      }

      // 2. Check user's balance before approving
      const currentYear = new Date().getFullYear();
      const { data: userProfile, error: profileError } = await (supabase as any)
        .from('profiles')
        .select('vacation_days_per_year')
        .eq('id', request.user_id)
        .single();

      if (profileError) throw profileError;

      const { data: existingApproved, error: balanceError } = await (supabase as any)
        .from('vacation_requests')
        .select('total_days, status')
        .eq('user_id', request.user_id)
        .in('status', ['approved', 'pending'])
        .neq('id', request.id)
        .gte('start_date', `${currentYear}-01-01`)
        .lte('start_date', `${currentYear}-12-31`);

      if (balanceError) throw balanceError;

      const usedDays = (existingApproved as { total_days: number }[]).reduce(
        (sum, r) => sum + r.total_days, 0
      );
      const allowance = userProfile.vacation_days_per_year ?? 25;

      if (usedDays + request.total_days > allowance) {
        throw new Error(
          `Nicht genügend Ferientage: ${allowance - usedDays} verfügbar, ${request.total_days} beantragt`
        );
      }

      // 3. Update vacation request status (only if still pending)
      const { error: updateError } = await (supabase as any)
        .from('vacation_requests')
        .update({
          status: 'approved',
          reviewed_by: profile!.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id)
        .eq('status', 'pending');

      if (updateError) throw updateError;

      // 4. Create time entries for each business day with rollback on failure
      const createdEntryIds: string[] = [];
      try {
        const start = parseISO(request.start_date);
        const end = parseISO(request.end_date);
        const days = eachDayOfInterval({ start, end });
        const isSingleDay = request.start_date === request.end_date;
        const useHalfDay = request.is_half_day && isSingleDay;
        const period = request.half_day_period || 'morning';

        // Determine vacation hours (local time)
        const vacationStartHour = useHalfDay && period === 'afternoon' ? 13 : 8;
        const vacationEndHour = useHalfDay && period === 'morning' ? 12 : useHalfDay ? 17 : 16;

        for (const day of days) {
          if (isWeekend(day)) continue;

          const dateStr = format(day, 'yyyy-MM-dd');
          const y = day.getFullYear();
          const m = day.getMonth();
          const d = day.getDate();

          // Create proper local-time Date objects so TIMESTAMPTZ stores correctly
          const wdStart = new Date(y, m, d, 8, 0, 0).toISOString();
          const wdEnd = new Date(y, m, d, useHalfDay ? (period === 'morning' ? 12 : 17) : 16, 0, 0).toISOString();
          const entryStart = new Date(y, m, d, vacationStartHour, 0, 0).toISOString();
          const entryEnd = new Date(y, m, d, vacationEndHour, 0, 0).toISOString();

          // Check for existing work day first (don't overwrite real data)
          const { data: existingWd } = await (supabase as any)
            .from('work_days')
            .select('id')
            .eq('user_id', request.user_id)
            .eq('date', dateStr)
            .maybeSingle();

          let workDayId: string;

          if (existingWd) {
            workDayId = existingWd.id;
          } else {
            const { data: newWd, error: wdError } = await (supabase as any)
              .from('work_days')
              .insert({
                user_id: request.user_id,
                date: dateStr,
                start_time: wdStart,
                end_time: wdEnd,
                is_finalized: !useHalfDay,
              })
              .select()
              .single();

            if (wdError) throw wdError;
            workDayId = newWd.id;
          }

          // Skip if vacation entry already exists for this day (idempotency)
          const { data: existingEntry } = await (supabase as any)
            .from('time_entries')
            .select('id')
            .eq('user_id', request.user_id)
            .eq('entry_type', 'vacation')
            .eq('work_day_id', workDayId)
            .maybeSingle();

          if (!existingEntry) {
            const { data: newEntry, error: teError } = await (supabase as any)
              .from('time_entries')
              .insert({
                work_day_id: workDayId,
                user_id: request.user_id,
                property_id: null,
                entry_type: 'vacation',
                start_time: entryStart,
                end_time: entryEnd,
                status: 'completed',
              })
              .select('id')
              .single();

            if (teError) throw teError;
            createdEntryIds.push(newEntry.id);
          }
        }
      } catch (entryError) {
        // Rollback: revert request status and delete created entries
        await (supabase as any)
          .from('vacation_requests')
          .update({
            status: 'pending',
            reviewed_by: null,
            reviewed_at: null,
          })
          .eq('id', request.id);

        if (createdEntryIds.length > 0) {
          await (supabase as any)
            .from('time_entries')
            .delete()
            .in('id', createdEntryIds);
        }

        throw entryError;
      }
    },
    onSuccess: () => {
      toast.success('Ferienantrag bewilligt');
      queryClient.invalidateQueries({ queryKey: ['vacation-pending'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-approved'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-own'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-used-days'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // ─── Reject mutation ───
  const rejectMutation = useMutation({
    mutationFn: async ({
      requestId,
      reason,
    }: {
      requestId: string;
      reason: string;
    }) => {
      const supabase = getClient();

      // Check current status first
      const { data: current, error: checkError } = await (supabase as any)
        .from('vacation_requests')
        .select('status')
        .eq('id', requestId)
        .single();

      if (checkError) throw checkError;
      if (current.status !== 'pending') {
        throw new Error('Antrag wurde bereits bearbeitet');
      }

      const { error } = await (supabase as any)
        .from('vacation_requests')
        .update({
          status: 'rejected',
          reviewed_by: profile!.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ferienantrag abgelehnt');
      setRejectingRequest(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['vacation-pending'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-own'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-used-days'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // ─── Cancel mutation (delete pending or revoke approved with time entry cleanup) ───
  const cancelMutation = useMutation({
    mutationFn: async (request: VacationRequestWithUser) => {
      const supabase = getClient();

      // If approved, delete associated vacation time entries and clean up work days
      if (request.status === 'approved') {
        const start = parseISO(request.start_date);
        const end = parseISO(request.end_date);
        const days = eachDayOfInterval({ start, end });

        for (const day of days) {
          if (isWeekend(day)) continue;
          const dateStr = format(day, 'yyyy-MM-dd');

          // Find the work day for this date
          const { data: workDay } = await (supabase as any)
            .from('work_days')
            .select('id, is_finalized')
            .eq('user_id', request.user_id)
            .eq('date', dateStr)
            .maybeSingle();

          if (!workDay) continue;

          // Delete vacation time entries on this work day
          const { error: deleteError } = await (supabase as any)
            .from('time_entries')
            .delete()
            .eq('work_day_id', workDay.id)
            .eq('entry_type', 'vacation');

          if (deleteError) throw new Error(`Zeiteinträge für ${dateStr} konnten nicht gelöscht werden`);

          // Check if work day has remaining entries
          const { data: remaining } = await (supabase as any)
            .from('time_entries')
            .select('id')
            .eq('work_day_id', workDay.id)
            .limit(1);

          if (!remaining || remaining.length === 0) {
            // No entries left — delete the empty work day
            await (supabase as any)
              .from('work_days')
              .delete()
              .eq('id', workDay.id);
          } else if (workDay.is_finalized) {
            // Has other entries but was finalized by vacation — un-finalize
            await (supabase as any)
              .from('work_days')
              .update({ is_finalized: false })
              .eq('id', workDay.id);
          }
        }
      }

      // Delete the vacation request
      const { error } = await (supabase as any)
        .from('vacation_requests')
        .delete()
        .eq('id', request.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ferienantrag storniert');
      queryClient.invalidateQueries({ queryKey: ['vacation-pending'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-approved'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-own'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-used-days'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // ─── Delete rejected request mutation ───
  const deleteRejectedMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('vacation_requests')
        .delete()
        .eq('id', requestId)
        .eq('status', 'rejected');

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Abgelehnter Antrag entfernt');
      queryClient.invalidateQueries({ queryKey: ['vacation-rejected'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-own'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-used-days'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const handleRefresh = async () => {
    await Promise.all([refetchCalendar(), refetchOwn(), refetchPending(), refetchApproved(), refetchRejected()]);
  };

  // ─── Calendar helpers ───
  const userColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueUsers = new Set(calendarRequests.map((r) => r.user_id));
    let i = 0;
    uniqueUsers.forEach((userId) => {
      map.set(userId, USER_COLORS[i % USER_COLORS.length]);
      i++;
    });
    return map;
  }, [calendarRequests]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthStart, monthEnd]);

  const getRequestsForDay = (day: Date) => {
    if (isWeekend(day)) return [];
    return calendarRequests.filter((req) => {
      const start = parseISO(req.start_date);
      const end = parseISO(req.end_date);
      return day >= start && day <= end;
    });
  };

  // ─── Saldo calculations ───
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const today = new Date();
  const vacationDaysPerYear = profile?.vacation_days_per_year ?? 25;

  const approvedPast = useMemo(() => {
    return ownRequests
      .filter((r) => r.status === 'approved' && r.end_date < todayStr)
      .reduce((sum, r) => sum + r.total_days, 0);
  }, [ownRequests, todayStr]);

  const approvedFuture = useMemo(() => {
    return ownRequests
      .filter((r) => r.status === 'approved' && r.end_date >= todayStr)
      .reduce((sum, r) => sum + r.total_days, 0);
  }, [ownRequests, todayStr]);

  const totalApproved = approvedPast + approvedFuture;
  const remaining = vacationDaysPerYear - totalApproved;
  const currentMonthNum = today.getMonth() + 1;
  const proRata = Math.round((vacationDaysPerYear * (currentMonthNum / 12)) * 10) / 10;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Beantragt
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Bewilligt
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Abgelehnt
          </span>
        );
      default:
        return null;
    }
  };

  const getUserName = (user: Profile) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    }
    return user.email;
  };

  // ─── Render ───
  return (
    <PageContainer
      header={<Header title="Ferien" />}
    >
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Tab bar */}
        <div className={cn(
          'flex gap-1 mb-4 p-1 bg-muted rounded-lg',
          canManageVacations ? '' : 'max-w-sm'
        )}>
          <button
            onClick={() => setActiveTab('kalender')}
            className={cn(
              'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
              activeTab === 'kalender'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Kalender
          </button>
          <button
            onClick={() => setActiveTab('saldo')}
            className={cn(
              'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
              activeTab === 'saldo'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Saldo
          </button>
          {canManageVacations && (
            <button
              onClick={() => setActiveTab('antraege')}
              className={cn(
                'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors relative',
                activeTab === 'antraege'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Anträge
              {pendingRequests.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}
        </div>
        {/* ════════════════ TAB 1: KALENDER ════════════════ */}
        {activeTab === 'kalender' && (
          <div>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-semibold">
                {format(currentMonth, 'MMMM yyyy', { locale: de })}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
              {/* Weekday headers */}
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                <div
                  key={day}
                  className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-2"
                >
                  {day}
                </div>
              ))}

              {/* Day cells */}
              {calendarDays.map((day) => {
                const dayRequests = getRequestsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const weekend = isWeekend(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'bg-white min-h-[60px] p-1 relative',
                      !isCurrentMonth && 'bg-gray-50',
                      weekend && 'bg-gray-100'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs',
                        !isCurrentMonth && 'text-gray-300',
                        weekend && isCurrentMonth && 'text-gray-400',
                        isToday &&
                          'bg-primary-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                      )}
                    >
                      {format(day, 'd')}
                    </span>

                    {/* Vacation bars/dots */}
                    <div className="mt-0.5 space-y-0.5">
                      {dayRequests.slice(0, 3).map((req) => {
                        const color = userColorMap.get(req.user_id) ?? '#999';
                        const isPending = req.status === 'pending';
                        return (
                          <div
                            key={req.id}
                            className={cn(
                              'h-1.5 rounded-full text-[8px] truncate',
                              isPending && 'opacity-50'
                            )}
                            style={{
                              backgroundColor: isPending ? 'transparent' : color,
                              border: isPending
                                ? `1px dashed ${color}`
                                : 'none',
                            }}
                            title={`${getUserName(req.user)} (${req.status === 'pending' ? 'beantragt' : 'bewilligt'})`}
                          />
                        );
                      })}
                      {dayRequests.length > 3 && (
                        <span className="text-[8px] text-gray-400">
                          +{dayRequests.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            {calendarRequests.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {Array.from(
                  new Map(
                    calendarRequests.map((r) => [r.user_id, r.user])
                  ).entries()
                ).map(([userId, user]) => (
                  <div key={userId} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: userColorMap.get(userId) ?? '#999',
                      }}
                    />
                    <span className="text-gray-600">{getUserName(user)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════ TAB 2: MEIN SALDO ════════════════ */}
        {activeTab === 'saldo' && (
          <div>
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Jahresanspruch</p>
                  <p className="text-2xl font-bold text-primary-700">
                    {vacationDaysPerYear}
                  </p>
                  <p className="text-xs text-muted-foreground">Tage</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Bezogen</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {approvedPast}
                  </p>
                  <p className="text-xs text-muted-foreground">Tage</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Bewilligt offen</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {approvedFuture}
                  </p>
                  <p className="text-xs text-muted-foreground">Tage</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Verfügbar</p>
                  <p className={cn(
                    'text-2xl font-bold',
                    remaining >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {remaining}
                  </p>
                  <p className="text-xs text-muted-foreground">Tage</p>
                </CardContent>
              </Card>
            </div>

            {/* Pro-rata info */}
            <div className="bg-blue-50 rounded-lg p-3 mb-6 text-sm text-blue-800">
              Bis {format(today, 'MMMM', { locale: de })} anteilsmässig verfügbar:{' '}
              <span className="font-semibold">{proRata} Tage</span>
            </div>

            {/* Own requests list */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Meine Anträge</h3>
              <Button
                size="sm"
                onClick={() => router.push('/vacation/new')}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Beantragen
              </Button>
            </div>
            {ownRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Keine Ferienanträge vorhanden</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ownRequests.map((req) => (
                  <Card key={req.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {format(parseISO(req.start_date), 'dd.MM.yyyy', {
                              locale: de,
                            })}{' '}
                            &ndash;{' '}
                            {format(parseISO(req.end_date), 'dd.MM.yyyy', {
                              locale: de,
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.total_days} {req.total_days === 1 ? 'Tag' : 'Tage'}
                            {req.is_half_day && ` (${req.half_day_period === 'afternoon' ? 'Nachmittag' : 'Vormittag'})`}
                          </p>
                          {req.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {req.notes}
                            </p>
                          )}
                          {req.rejection_reason && (
                            <p className="text-xs text-red-600 mt-1">
                              Grund: {req.rejection_reason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(req.status)}
                          {/* Cancel button: pending (own) or approved (admin only) */}
                          {(req.status === 'pending' || (req.status === 'approved' && canManageVacations)) && (
                            <button
                              onClick={() => {
                                if (confirm(
                                  req.status === 'approved'
                                    ? 'Bewilligten Antrag stornieren? Die zugehörigen Zeiteinträge werden gelöscht.'
                                    : 'Antrag stornieren?'
                                )) {
                                  cancelMutation.mutate(req);
                                }
                              }}
                              disabled={cancelMutation.isPending}
                              className="p-2 -mr-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Stornieren"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ════════════════ TAB 3: ANTRÄGE (Admin) ════════════════ */}
        {activeTab === 'antraege' && canManageVacations && (
          <div className="space-y-6">
            {/* Pending requests */}
            <div>
              <h3 className="font-semibold mb-3">Offene Anträge</h3>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>Keine offenen Anträge</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((req) => (
                    <Card key={req.id}>
                      <CardContent className="p-4">
                        <div className="mb-3">
                          <p className="font-semibold">
                            {getUserName(req.user)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(req.start_date), 'dd.MM.yyyy', {
                              locale: de,
                            })}{' '}
                            &ndash;{' '}
                            {format(parseISO(req.end_date), 'dd.MM.yyyy', {
                              locale: de,
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.total_days} {req.total_days === 1 ? 'Tag' : 'Tage'}
                            {req.is_half_day && ` (${req.half_day_period === 'afternoon' ? 'Nachmittag' : 'Vormittag'})`}
                          </p>
                          {req.notes && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {req.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => approveMutation.mutate(req)}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending ? 'Wird bewilligt...' : 'Bewilligen'}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 h-11 border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setRejectingRequest(req);
                              setRejectionReason('');
                            }}
                            disabled={rejectMutation.isPending}
                          >
                            Ablehnen
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Approved requests */}
            <div>
              <h3 className="font-semibold mb-3">Bewilligte Ferien ({currentYear})</h3>
              {approvedRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Keine bewilligten Anträge</p>
              ) : (
                <div className="space-y-3">
                  {approvedRequests.map((req) => (
                    <Card key={req.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">
                              {getUserName(req.user)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(parseISO(req.start_date), 'dd.MM.yyyy', {
                                locale: de,
                              })}{' '}
                              &ndash;{' '}
                              {format(parseISO(req.end_date), 'dd.MM.yyyy', {
                                locale: de,
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {req.total_days} {req.total_days === 1 ? 'Tag' : 'Tage'}
                              {req.is_half_day && ` (${req.half_day_period === 'afternoon' ? 'Nachmittag' : 'Vormittag'})`}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Bewilligte Ferien von ${getUserName(req.user)} stornieren? Die Zeiteinträge werden gelöscht.`)) {
                                cancelMutation.mutate(req);
                              }
                            }}
                            disabled={cancelMutation.isPending}
                          >
                            Stornieren
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Rejected requests */}
            <div>
              <h3 className="font-semibold mb-3">Abgelehnte Anträge ({currentYear})</h3>
              {rejectedRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Keine abgelehnten Anträge</p>
              ) : (
                <div className="space-y-3">
                  {rejectedRequests.map((req) => (
                    <Card key={req.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">
                              {getUserName(req.user)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(parseISO(req.start_date), 'dd.MM.yyyy', {
                                locale: de,
                              })}{' '}
                              &ndash;{' '}
                              {format(parseISO(req.end_date), 'dd.MM.yyyy', {
                                locale: de,
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {req.total_days} {req.total_days === 1 ? 'Tag' : 'Tage'}
                              {req.is_half_day && ` (${req.half_day_period === 'afternoon' ? 'Nachmittag' : 'Vormittag'})`}
                            </p>
                            {req.rejection_reason && (
                              <p className="text-xs text-red-600 mt-1">
                                Grund: {req.rejection_reason}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-300 text-gray-600 hover:bg-gray-50"
                            onClick={() => {
                              if (confirm(`Abgelehnten Antrag von ${getUserName(req.user)} endgültig entfernen?`)) {
                                deleteRejectedMutation.mutate(req.id);
                              }
                            }}
                            disabled={deleteRejectedMutation.isPending}
                          >
                            Entfernen
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </PullToRefresh>

      {/* Rejection Dialog */}
      <Dialog
        open={!!rejectingRequest}
        onOpenChange={() => setRejectingRequest(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Antrag ablehnen</DialogTitle>
            <DialogDescription>
              Bitte geben Sie einen Grund für die Ablehnung an.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {rejectingRequest && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <p className="font-medium text-sm">
                  {getUserName(rejectingRequest.user)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(rejectingRequest.start_date), 'dd.MM.yyyy', {
                    locale: de,
                  })}{' '}
                  &ndash;{' '}
                  {format(parseISO(rejectingRequest.end_date), 'dd.MM.yyyy', {
                    locale: de,
                  })}{' '}
                  ({rejectingRequest.total_days}{' '}
                  {rejectingRequest.total_days === 1 ? 'Tag' : 'Tage'})
                </p>
              </div>
            )}
            <Input
              placeholder="Ablehnungsgrund..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectingRequest(null)}
            >
              Abbrechen
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() =>
                rejectingRequest &&
                rejectMutation.mutate({
                  requestId: rejectingRequest.id,
                  reason: rejectionReason,
                })
              }
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Wird abgelehnt...' : 'Ablehnen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

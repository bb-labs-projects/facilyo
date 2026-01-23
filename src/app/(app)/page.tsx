'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Building2, MapPin } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimerDisplay } from '@/components/time-tracking/timer-display';
import { TimerControls, WorkDayControls } from '@/components/time-tracking/control-buttons';
import { PropertySelector, PropertyDisplay } from '@/components/time-tracking/property-selector';
import { TimeEntryList } from '@/components/time-tracking/work-day-card';
import { useTimeTracking } from '@/hooks/use-time-tracking';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import type { Property, TimeEntryWithProperty } from '@/types/database';

export default function HomePage() {
  const profile = useAuthStore((state) => state.profile);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  const {
    workDay,
    activeEntry,
    activeProperty,
    isPaused,
    isTimerActive,
    isWorkDayActive,
    timerStatus,
    formattedTime,
    formattedWorkDayDuration,
    startWorkDay,
    endWorkDay,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
  } = useTimeTracking();

  const {
    coords,
    isLoading: isLoadingLocation,
    getCurrentPosition,
    error: locationError,
  } = useGeolocation();

  // Fetch assigned properties
  const { data: properties = [] } = useQuery({
    queryKey: ['properties', profile?.id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('property_assignments')
        .select('property:properties(*)')
        .eq('user_id', profile!.id);

      if (error) throw error;
      return (data as { property: Property }[]).map((d) => d.property);
    },
    enabled: !!profile?.id,
  });

  // Fetch today's time entries
  const { data: todayEntries = [] } = useQuery({
    queryKey: ['time-entries', workDay?.id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, property:properties(*)')
        .eq('work_day_id', workDay!.id)
        .order('start_time', { ascending: false });

      if (error) throw error;
      return data as TimeEntryWithProperty[];
    },
    enabled: !!workDay?.id,
    refetchInterval: isTimerActive ? 30000 : false, // Refresh every 30s when timer active
  });

  // Set selected property from active entry
  useEffect(() => {
    if (activeProperty) {
      setSelectedProperty(activeProperty);
    }
  }, [activeProperty]);

  // Work day handlers
  const handleStartWorkDay = async () => {
    try {
      await startWorkDay();
      toast.success('Arbeitstag wurde gestartet');
    } catch (error) {
      toast.error('Fehler beim Starten des Arbeitstags');
    }
  };

  const handleEndWorkDay = async () => {
    try {
      await endWorkDay();
      toast.success('Arbeitstag wurde beendet');
    } catch (error) {
      toast.error('Fehler beim Beenden des Arbeitstags');
    }
  };

  // Timer handlers
  const handleStartTimer = async () => {
    if (!selectedProperty) {
      toast.error('Bitte wählen Sie eine Liegenschaft');
      return;
    }

    try {
      await startTimer(selectedProperty.id, coords || undefined);
      toast.success('Timer wurde gestartet');
    } catch (error) {
      toast.error('Fehler beim Starten des Timers');
    }
  };

  const handlePauseTimer = () => {
    pauseTimer();
    toast.info('Timer pausiert');
  };

  const handleResumeTimer = () => {
    resumeTimer();
    toast.info('Timer fortgesetzt');
  };

  const handleStopTimer = async () => {
    try {
      await stopTimer(coords || undefined);
      toast.success('Zeit wurde erfasst');
    } catch (error) {
      toast.error('Fehler beim Beenden des Timers');
    }
  };

  const handleRequestLocation = async () => {
    try {
      await getCurrentPosition();
    } catch (error) {
      toast.error('Standort konnte nicht ermittelt werden');
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Guten Morgen';
    if (hour < 17) return 'Guten Tag';
    return 'Guten Abend';
  };

  return (
    <PageContainer
      header={
        <Header
          title={greeting()}
          subtitle={
            profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
              : undefined
          }
        />
      }
    >
      {/* Work Day Section */}
      {!isWorkDayActive ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Arbeitstag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Starten Sie Ihren Arbeitstag, um Zeit zu erfassen.
            </p>
            <WorkDayControls
              isActive={false}
              onStart={handleStartWorkDay}
              onEnd={handleEndWorkDay}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Timer Card */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              {/* Timer Display */}
              <TimerDisplay
                time={formattedTime}
                status={timerStatus}
                propertyName={activeProperty?.name}
                className="mb-6"
              />

              {/* Property Selector (only when timer is not active) */}
              {!isTimerActive && (
                <PropertySelector
                  properties={properties}
                  selectedProperty={selectedProperty}
                  onSelect={setSelectedProperty}
                  userCoords={coords}
                  isLoadingLocation={isLoadingLocation}
                  onRequestLocation={handleRequestLocation}
                  className="mb-6"
                />
              )}

              {/* Current Property (when timer is active) */}
              {isTimerActive && activeProperty && (
                <div className="flex items-center justify-center gap-2 mb-6 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{activeProperty.name}</span>
                </div>
              )}

              {/* Timer Controls */}
              {isTimerActive ? (
                <TimerControls
                  status={timerStatus}
                  onStart={handleStartTimer}
                  onPause={handlePauseTimer}
                  onResume={handleResumeTimer}
                  onStop={handleStopTimer}
                />
              ) : (
                <TimerControls
                  status="inactive"
                  onStart={handleStartTimer}
                  onPause={handlePauseTimer}
                  onResume={handleResumeTimer}
                  onStop={handleStopTimer}
                  disabled={!selectedProperty}
                />
              )}
            </CardContent>
          </Card>

          {/* Work Day Summary */}
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Arbeitstag aktiv seit {workDay && swissFormat.time(workDay.start_time)}
                </div>
                <div className="font-mono font-semibold">
                  {formattedWorkDayDuration}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Entries */}
          {todayEntries.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Heutige Einträge</h2>
              <TimeEntryList
                entries={todayEntries}
                emptyMessage="Noch keine Einträge heute"
              />
            </div>
          )}

          {/* End Work Day */}
          <WorkDayControls
            isActive={true}
            onStart={handleStartWorkDay}
            onEnd={handleEndWorkDay}
          />
        </>
      )}
    </PageContainer>
  );
}

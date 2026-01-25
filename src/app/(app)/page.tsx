'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Building2, Car, Coffee } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimerDisplay } from '@/components/time-tracking/timer-display';
import {
  StatusBadge,
  TravelControls,
  PropertyControls,
  BreakControls,
  WorkDayControls,
} from '@/components/time-tracking/control-buttons';
import { PropertySelector } from '@/components/time-tracking/property-selector';
import { TimeEntryList } from '@/components/time-tracking/work-day-card';
import { PropertyTimeSummary } from '@/components/time-tracking/property-time-summary';
import { ActiveChecklists } from '@/components/time-tracking/active-checklists';
import { ActiveAufgaben } from '@/components/time-tracking/active-aufgaben';
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
    currentEntryType,
    isTimerActive,
    isWorkDayActive,
    isOnBreak,
    isTraveling,
    isWorkingOnProperty,
    formattedTime,
    startWorkDay,
    endWorkDay,
    startPropertyWork,
    stopPropertyWork,
    startBreak,
    endBreak,
  } = useTimeTracking();

  const {
    coords,
    isLoading: isLoadingLocation,
    getCurrentPosition,
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
    refetchInterval: isTimerActive ? 30000 : false,
  });

  // Calculate total working hours from work day duration
  const [workDaySeconds, setWorkDaySeconds] = useState(0);

  useEffect(() => {
    if (!workDay?.start_time) {
      setWorkDaySeconds(0);
      return;
    }

    const startTime = new Date(workDay.start_time).getTime();
    const endTime = workDay.end_time ? new Date(workDay.end_time).getTime() : null;

    const calculateWorkDayDuration = () => {
      const end = endTime ?? Date.now();
      return Math.floor((end - startTime) / 1000);
    };

    setWorkDaySeconds(calculateWorkDayDuration());

    if (!endTime) {
      const interval = setInterval(() => {
        setWorkDaySeconds(calculateWorkDayDuration());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [workDay]);

  const formattedWorkDayDuration = swissFormat.duration(workDaySeconds);

  // Set selected property from active entry
  useEffect(() => {
    if (activeProperty) {
      setSelectedProperty(activeProperty);
    }
  }, [activeProperty]);

  // Handlers
  const handleStartWorkDay = async () => {
    try {
      await startWorkDay();
      toast.success('Arbeitstag gestartet - Fahrzeit läuft');
    } catch (error: any) {
      if (error.message?.includes('endgültig beendet')) {
        toast.error(error.message);
      } else {
        toast.error('Fehler beim Starten des Arbeitstags');
      }
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

  const handleStartPropertyWork = async () => {
    if (!selectedProperty) {
      toast.error('Bitte wählen Sie eine Liegenschaft');
      return;
    }

    try {
      await startPropertyWork(selectedProperty.id, coords || undefined);
      toast.success(`Arbeit auf ${selectedProperty.name} gestartet`);
    } catch (error) {
      toast.error('Fehler beim Starten der Arbeit');
    }
  };

  const handleStopPropertyWork = async () => {
    try {
      await stopPropertyWork(coords || undefined);
      setSelectedProperty(null);
      toast.success('Arbeit beendet - Fahrzeit läuft');
    } catch (error) {
      toast.error('Fehler beim Beenden der Arbeit');
    }
  };

  const handleStartBreak = async () => {
    try {
      await startBreak();
      toast.success('Pause gestartet');
    } catch (error) {
      toast.error('Fehler beim Starten der Pause');
    }
  };

  const handleEndBreak = async () => {
    try {
      await endBreak();
      toast.success('Pause beendet');
    } catch (error) {
      toast.error('Fehler beim Beenden der Pause');
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

  // Get status icon based on current entry type
  const getStatusIcon = () => {
    switch (currentEntryType) {
      case 'travel':
        return <Car className="h-5 w-5" />;
      case 'property':
        return <Building2 className="h-5 w-5" />;
      case 'break':
        return <Coffee className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
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
      {/* Work Day Section - Not Started */}
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
              {/* Status Badge */}
              <div className="flex justify-center mb-4">
                <StatusBadge
                  entryType={currentEntryType}
                  propertyName={activeProperty?.name}
                />
              </div>

              {/* Timer Display */}
              <TimerDisplay
                time={formattedTime}
                status={isTimerActive ? 'active' : 'inactive'}
                propertyName={
                  currentEntryType === 'property'
                    ? activeProperty?.name
                    : currentEntryType === 'travel'
                    ? 'Fahrzeit'
                    : currentEntryType === 'break'
                    ? 'Pause'
                    : undefined
                }
                className="mb-6"
              />

              {/* Controls based on current mode */}
              {isTraveling && (
                <>
                  {/* Property Selector when traveling */}
                  <PropertySelector
                    properties={properties}
                    selectedProperty={selectedProperty}
                    onSelect={setSelectedProperty}
                    userCoords={coords}
                    isLoadingLocation={isLoadingLocation}
                    onRequestLocation={handleRequestLocation}
                    autoSelectNearest={true}
                    className="mb-6"
                  />
                  <TravelControls
                    onStartProperty={handleStartPropertyWork}
                    onStartBreak={handleStartBreak}
                    onEndWorkDay={handleEndWorkDay}
                    showPropertyButton={!!selectedProperty}
                    disabled={!selectedProperty}
                  />
                </>
              )}

              {isWorkingOnProperty && (
                <PropertyControls
                  onStopProperty={handleStopPropertyWork}
                  onStartBreak={handleStartBreak}
                />
              )}

              {isOnBreak && (
                <BreakControls onEndBreak={handleEndBreak} />
              )}
            </CardContent>
          </Card>

          {/* Active Aufgaben (only during property work) */}
          {isWorkingOnProperty && activeProperty && (
            <ActiveAufgaben
              propertyId={activeProperty.id}
              className="mb-6"
            />
          )}

          {/* Active Checklists (only during property work) */}
          {isWorkingOnProperty && activeProperty && activeEntry && (
            <ActiveChecklists
              propertyId={activeProperty.id}
              timeEntryId={activeEntry.id}
              className="mb-6"
            />
          )}

          {/* Work Day Summary */}
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Gearbeitete Zeit heute
                </div>
                <div className="font-mono font-semibold">
                  {formattedWorkDayDuration}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Property Time Summary */}
          {todayEntries.length > 0 && (
            <PropertyTimeSummary entries={todayEntries} className="mb-6" />
          )}

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

          {/* Work Day Controls */}
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

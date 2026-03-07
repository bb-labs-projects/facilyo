'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { TimeEntryList, PropertyGroupedEntries } from '@/components/time-tracking/work-day-card';
import { PropertyTimeSummary } from '@/components/time-tracking/property-time-summary';
import { ActiveChecklists } from '@/components/time-tracking/active-checklists';
import { ActiveAufgaben } from '@/components/time-tracking/active-aufgaben';
import { ActivityTypeSelector, ActivityTypeBadge } from '@/components/time-tracking/activity-type-selector';
import { useTimeTracking } from '@/hooks/use-time-tracking';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import type { Property, TimeEntryWithProperty, ActivityType } from '@/types/database';

export default function HomePage() {
  const tGreetings = useTranslations('greetings');
  const tWorkDay = useTranslations('workDay');
  const tTimeTracking = useTranslations('timeTracking');
  const tEntryTypes = useTranslations('entryTypes');
  const tCommon = useTranslations('common');
  const profile = useAuthStore((state) => state.profile);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedActivityType, setSelectedActivityType] = useState<ActivityType | null>(null);
  const [isChangingActivity, setIsChangingActivity] = useState(false);

  const {
    workDay,
    activeEntry,
    activeProperty,
    currentEntryType,
    currentActivityType,
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
    updateActivityType,
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
  const { data: todayEntries = [], refetch: refetchEntries } = useQuery({
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
  }, [workDay?.start_time, workDay?.end_time]);

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
      toast.success(tWorkDay('startedWithTravel'));
      refetchEntries();
    } catch (error: any) {
      if (error.message?.includes('endgültig beendet')) {
        toast.error(error.message);
      } else {
        toast.error(error.message || tWorkDay('startError'));
      }
    }
  };

  const handleEndWorkDay = async () => {
    try {
      await endWorkDay();
      toast.success(tWorkDay('ended'));
      refetchEntries();
    } catch (error: any) {
      toast.error(error.message || tWorkDay('endError'));
    }
  };

  const handleStartPropertyWork = async () => {
    if (!selectedProperty) {
      toast.error(tTimeTracking('selectPropertyFirst'));
      return;
    }

    if (!selectedActivityType) {
      toast.error(tTimeTracking('selectActivityFirst'));
      return;
    }

    try {
      await startPropertyWork(selectedProperty.id, selectedActivityType, coords || undefined);
      toast.success(tTimeTracking('workStarted', { property: selectedProperty.name }));
      setSelectedActivityType(null);
      refetchEntries();
    } catch (error: any) {
      toast.error(error.message || tTimeTracking('workStartError'));
    }
  };

  const handleChangeActivity = async (newActivity: ActivityType) => {
    try {
      await updateActivityType(newActivity);
      setIsChangingActivity(false);
      toast.success(tTimeTracking('activityChanged'));
    } catch (error: any) {
      toast.error(error.message || tTimeTracking('activityChangeError'));
    }
  };

  const handleStopPropertyWork = async () => {
    try {
      await stopPropertyWork(coords || undefined);
      setSelectedProperty(null);
      toast.success(tTimeTracking('workEndedTravel'));
      refetchEntries();
    } catch (error: any) {
      toast.error(error.message || tTimeTracking('workEndError'));
    }
  };

  const handleStartBreak = async () => {
    try {
      await startBreak();
      toast.success(tTimeTracking('pauseStarted'));
      refetchEntries();
    } catch (error: any) {
      toast.error(error.message || tTimeTracking('pauseStartError'));
    }
  };

  const handleEndBreak = async () => {
    try {
      await endBreak();
      toast.success(tTimeTracking('pauseEnded'));
      refetchEntries();
    } catch (error: any) {
      toast.error(error.message || tTimeTracking('pauseEndError'));
    }
  };

  const handleRequestLocation = async () => {
    try {
      await getCurrentPosition();
    } catch (error) {
      toast.error(tTimeTracking('locationError'));
    }
  };

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('time_entries')
        .delete()
        .eq('id', entryId);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(tTimeTracking('entryDeleted'));
      refetchEntries();
    },
    onError: (error: any) => {
      console.error('Delete failed:', error);
      toast.error(`${tTimeTracking('entryDeleteError')}: ${error?.message || tCommon('unknown')}`);
    },
  });

  const handleDeleteEntry = (entry: TimeEntryWithProperty) => {
    if (entry.entry_type === 'vacation') {
      toast.error(tTimeTracking('vacationEntryNote'));
      return;
    }
    deleteEntryMutation.mutate(entry.id);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return tGreetings('morning');
    if (hour < 17) return tGreetings('afternoon');
    return tGreetings('evening');
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
              {tWorkDay('title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {tWorkDay('startDescription')}
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
                    ? tEntryTypes('travel')
                    : currentEntryType === 'break'
                    ? tEntryTypes('break')
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
                    className="mb-4"
                  />

                  {/* Activity Type Selector - only show when property is selected */}
                  {selectedProperty && (
                    <ActivityTypeSelector
                      selectedActivity={selectedActivityType}
                      onSelect={setSelectedActivityType}
                      propertyType={selectedProperty.type}
                      className="mb-6"
                    />
                  )}

                  <TravelControls
                    onStartProperty={handleStartPropertyWork}
                    onStartBreak={handleStartBreak}
                    onEndWorkDay={handleEndWorkDay}
                    showPropertyButton={!!selectedProperty}
                    propertyDisabled={!selectedProperty || !selectedActivityType}
                  />
                </>
              )}

              {isWorkingOnProperty && (
                <>
                  {/* Current Activity Type */}
                  {currentActivityType && !isChangingActivity && (
                    <div className="flex justify-center mb-4">
                      <ActivityTypeBadge
                        activity={currentActivityType}
                        onChangeClick={() => setIsChangingActivity(true)}
                      />
                    </div>
                  )}

                  {/* Activity Change Selector */}
                  {isChangingActivity && (
                    <div className="mb-4">
                      <ActivityTypeSelector
                        selectedActivity={currentActivityType}
                        onSelect={handleChangeActivity}
                        propertyType={activeProperty?.type}
                      />
                      <button
                        onClick={() => setIsChangingActivity(false)}
                        className="mt-2 w-full text-sm text-muted-foreground hover:text-foreground"
                      >
                        {tCommon('cancel')}
                      </button>
                    </div>
                  )}

                  <PropertyControls
                    onStopProperty={handleStopPropertyWork}
                    onStartBreak={handleStartBreak}
                  />
                </>
              )}

              {isOnBreak && (
                <BreakControls onEndBreak={handleEndBreak} />
              )}

              {/* Fallback: work day active but no active entry (stuck state) */}
              {!isTraveling && !isWorkingOnProperty && !isOnBreak && (
                <>
                  <PropertySelector
                    properties={properties}
                    selectedProperty={selectedProperty}
                    onSelect={setSelectedProperty}
                    userCoords={coords}
                    isLoadingLocation={isLoadingLocation}
                    onRequestLocation={handleRequestLocation}
                    autoSelectNearest={true}
                    className="mb-4"
                  />

                  {selectedProperty && (
                    <ActivityTypeSelector
                      selectedActivity={selectedActivityType}
                      onSelect={setSelectedActivityType}
                      propertyType={selectedProperty.type}
                      className="mb-6"
                    />
                  )}

                  <TravelControls
                    onStartProperty={handleStartPropertyWork}
                    onStartBreak={handleStartBreak}
                    onEndWorkDay={handleEndWorkDay}
                    showPropertyButton={!!selectedProperty}
                    propertyDisabled={!selectedProperty || !selectedActivityType}
                  />
                </>
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
                  {tWorkDay('workedTimeToday')}
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

          {/* Today's Entries - Grouped by Property */}
          {todayEntries.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">{tTimeTracking('todayEntries')}</h2>
              <PropertyGroupedEntries
                entries={todayEntries}
                onEntryDelete={handleDeleteEntry}
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

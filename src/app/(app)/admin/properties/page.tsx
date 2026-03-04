'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, MapPin, Edit, Trash2, Search, Power, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/error-boundary';
import type { Property, PropertyInsert, PropertyUpdate, PropertyType, Profile, Client, ClientInsert } from '@/types/database';
import { getInitials } from '@/lib/utils';

const propertyTypeLabels: Record<PropertyType, string> = {
  residential: 'Wohngebäude',
  commercial: 'Gewerbe',
  industrial: 'Industrie',
  mixed: 'Gemischt',
  office: 'Büro',
  private_maintenance: 'Privatunterhalt',
};

export default function AdminPropertiesPage() {
  return (
    <ErrorBoundary>
      <AdminPropertiesPageContent />
    </ErrorBoundary>
  );
}

function AdminPropertiesPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);

  const [searchQuery, setSearchQuery] = useState('');
  const [showInactiveProperties, setShowInactiveProperties] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivatingProperty, setDeactivatingProperty] = useState<Property | null>(null);
  const [showUsersSheet, setShowUsersSheet] = useState(false);
  const [assigningProperty, setAssigningProperty] = useState<Property | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [type, setType] = useState<PropertyType>('residential');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geofenceRadius, setGeofenceRadius] = useState('100');

  // Client selection state
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [creatingNewClient, setCreatingNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientContactPerson, setNewClientContactPerson] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientPostalCode, setNewClientPostalCode] = useState('');
  const [newClientCity, setNewClientCity] = useState('');

  // Validation state
  const [latitudeError, setLatitudeError] = useState<string | null>(null);
  const [longitudeError, setLongitudeError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Fetch properties
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('properties')
        .select('*, organizations:organization_id(name)')
        .order('name');

      if (error) throw error;
      return data as (Property & { organizations?: { name: string } })[];
    },
  });

  // Fetch all users (employees)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-for-assignment'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('first_name');

      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch active clients for dropdown
  const { data: activeClients = [] } = useQuery({
    queryKey: ['active-clients'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as Client[];
    },
  });

  // Fetch property assignments for the selected property
  const { data: propertyAssignments = [] } = useQuery({
    queryKey: ['property-assignments', assigningProperty?.id],
    queryFn: async () => {
      if (!assigningProperty) return [];
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('property_assignments')
        .select('user_id')
        .eq('property_id', assigningProperty.id);

      if (error) throw error;
      return data.map((a: { user_id: string }) => a.user_id) as string[];
    },
    enabled: !!assigningProperty,
  });

  // Lock to prevent concurrent session refreshes
  const sessionRefreshLock = useRef(false);
  const lastSessionCheck = useRef(0);

  // Helper to ensure valid session before database operations
  const ensureValidSession = async () => {
    // Skip if we checked recently (within 5 seconds)
    const now = Date.now();
    if (now - lastSessionCheck.current < 5000) {
      return;
    }

    // Wait if another refresh is in progress
    if (sessionRefreshLock.current) {
      // Wait for the other refresh to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }

    sessionRefreshLock.current = true;
    try {
      const supabase = getClient();
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        // Try to refresh the session
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw new Error('Sitzung abgelaufen. Bitte melden Sie sich erneut an.');
        }
      }
      lastSessionCheck.current = now;
    } finally {
      sessionRefreshLock.current = false;
    }
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: PropertyInsert) => {
      const supabase = getClient();

      // Ensure valid session before insert
      await ensureValidSession();

      const { data: result, error } = await (supabase as any)
        .from('properties')
        .insert({ ...data, organization_id: organizationId })
        .select()
        .single();

      if (error) {
        // Check if it's a permission/auth error
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          // Try refreshing session and retry once
          await supabase.auth.refreshSession();
          const { data: retryResult, error: retryError } = await (supabase as any)
            .from('properties')
            .insert({ ...data, organization_id: organizationId })
            .select()
            .single();

          if (retryError) throw retryError;
          return retryResult as Property;
        }
        throw error;
      }
      return result as Property;
    },
    onSuccess: () => {
      toast.success('Liegenschaft wurde erstellt');
      queryClient.invalidateQueries({ queryKey: ['admin-properties'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PropertyUpdate }) => {
      const supabase = getClient();

      // Ensure valid session before update
      await ensureValidSession();

      const { data: result, error } = await (supabase as any)
        .from('properties')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        // Check if it's a permission/auth error
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { data: retryResult, error: retryError } = await (supabase as any)
            .from('properties')
            .update(data)
            .eq('id', id)
            .select()
            .single();

          if (retryError) throw retryError;
          return retryResult as Property;
        }
        throw error;
      }
      return result as Property;
    },
    onSuccess: () => {
      toast.success('Liegenschaft wurde aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['admin-properties'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Hard-delete removed — use deactivate (soft-delete) to preserve historical data

  // Toggle property active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ propertyId, isActive }: { propertyId: string; isActive: boolean }) => {
      const supabase = getClient();

      // Ensure valid session before toggle
      await ensureValidSession();

      const { error } = await (supabase as any)
        .from('properties')
        .update({ is_active: isActive })
        .eq('id', propertyId);

      if (error) {
        // Check if it's a permission/auth error
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { error: retryError } = await (supabase as any)
            .from('properties')
            .update({ is_active: isActive })
            .eq('id', propertyId);

          if (retryError) throw retryError;
          return { propertyId, isActive };
        }
        throw error;
      }
      return { propertyId, isActive };
    },
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? 'Liegenschaft aktiviert' : 'Liegenschaft deaktiviert');
      queryClient.invalidateQueries({ queryKey: ['admin-properties'] });
      setShowDeactivateDialog(false);
      setDeactivatingProperty(null);
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Toggle user assignment to property
  const toggleUserAssignmentMutation = useMutation({
    mutationFn: async ({ propertyId, userId, assign }: { propertyId: string; userId: string; assign: boolean }) => {
      const supabase = getClient();
      await ensureValidSession();

      if (assign) {
        const { error } = await (supabase as any)
          .from('property_assignments')
          .insert({ property_id: propertyId, user_id: userId, organization_id: organizationId });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('property_assignments')
          .delete()
          .eq('property_id', propertyId)
          .eq('user_id', userId);
        if (error) throw error;
      }
      return { propertyId, userId, assign };
    },
    onSuccess: () => {
      toast.success('Zuweisung aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['property-assignments', assigningProperty?.id] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Assign/unassign all users to property
  const toggleAllUsersMutation = useMutation({
    mutationFn: async ({ propertyId, assign }: { propertyId: string; assign: boolean }) => {
      const supabase = getClient();
      await ensureValidSession();

      if (assign) {
        // Get currently assigned user IDs
        const unassignedUsers = allUsers.filter(u => !propertyAssignments.includes(u.id));
        if (unassignedUsers.length > 0) {
          const { error } = await (supabase as any)
            .from('property_assignments')
            .insert(unassignedUsers.map(u => ({ property_id: propertyId, user_id: u.id, organization_id: organizationId })));
          if (error) throw error;
        }
      } else {
        // Remove all assignments for this property
        const { error } = await (supabase as any)
          .from('property_assignments')
          .delete()
          .eq('property_id', propertyId);
        if (error) throw error;
      }
      return { propertyId, assign };
    },
    onSuccess: (_, { assign }) => {
      toast.success(assign ? 'Allen Mitarbeitern zugewiesen' : 'Alle Zuweisungen entfernt');
      queryClient.invalidateQueries({ queryKey: ['property-assignments', assigningProperty?.id] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageProperties) {
      router.push('/admin');
    }
  }, [permissions.canManageProperties, router]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setCity('');
    setPostalCode('');
    setType('residential');
    setLatitude('');
    setLongitude('');
    setGeofenceRadius('100');
    setLatitudeError(null);
    setLongitudeError(null);
    setSelectedClientId('');
    setCreatingNewClient(false);
    setNewClientName('');
    setNewClientContactPerson('');
    setNewClientEmail('');
    setNewClientPhone('');
    setNewClientAddress('');
    setNewClientPostalCode('');
    setNewClientCity('');
    setEditingProperty(null);
    setShowForm(false);
  };

  const openEditForm = (property: Property) => {
    setName(property.name);
    setAddress(property.address);
    setCity(property.city);
    setPostalCode(property.postal_code);
    setType(property.type);
    setLatitude(property.latitude?.toString() || '');
    setLongitude(property.longitude?.toString() || '');
    setGeofenceRadius(property.geofence_radius.toString());
    setLatitudeError(null);
    setLongitudeError(null);
    setSelectedClientId(property.client_id || '');
    setCreatingNewClient(false);
    setEditingProperty(property);
    setShowForm(true);
  };

  // Parse and validate coordinate value
  const parseCoordinate = (value: string, min: number, max: number): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = parseFloat(trimmed);
    if (isNaN(num)) return null;
    if (num < min || num > max) return null;
    return num;
  };

  // Validate latitude on blur
  const validateLatitude = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setLatitudeError(null);
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      setLatitudeError('Ungültige Zahl');
    } else if (num < -90 || num > 90) {
      setLatitudeError('Muss zwischen -90 und 90 liegen');
    } else {
      setLatitudeError(null);
    }
  };

  // Validate longitude on blur
  const validateLongitude = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setLongitudeError(null);
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      setLongitudeError('Ungültige Zahl');
    } else if (num < -180 || num > 180) {
      setLongitudeError('Muss zwischen -180 und 180 liegen');
    } else {
      setLongitudeError(null);
    }
  };

  const geocodeAddress = async (addr: string, postal: string, cityName: string): Promise<{ lat: number; lng: number } | null> => {
    const query = [addr, postal, cityName].filter(Boolean).join(', ');
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      format: 'json',
      q: query,
      limit: '1',
      countrycodes: 'ch',
    })}`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FacilityTrack/1.0' },
      });
      if (!response.ok) return null;
      const results = await response.json();
      if (results.length > 0) {
        return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let parsedLatitude = parseCoordinate(latitude, -90, 90);
    let parsedLongitude = parseCoordinate(longitude, -180, 180);

    // Validate: if one coordinate is set, both must be set
    if ((parsedLatitude !== null) !== (parsedLongitude !== null)) {
      toast.error('Bitte geben Sie sowohl Breitengrad als auch Längengrad an, oder lassen Sie beide leer.');
      return;
    }

    // Auto-geocode if both coordinates are empty and address is available
    if (parsedLatitude === null && parsedLongitude === null && address.trim() && city.trim()) {
      setIsGeocoding(true);
      try {
        const result = await geocodeAddress(address.trim(), postalCode.trim(), city.trim());
        if (result) {
          parsedLatitude = result.lat;
          parsedLongitude = result.lng;
          setLatitude(result.lat.toString());
          setLongitude(result.lng.toString());
          toast.success('Koordinaten wurden automatisch ermittelt');
        } else {
          toast.warning('Adresse konnte nicht geocodiert werden – Liegenschaft wird ohne Koordinaten gespeichert.');
        }
      } finally {
        setIsGeocoding(false);
      }
    }

    const parsedRadius = parseInt(geofenceRadius.trim());

    // If creating a new client inline, insert it first
    let clientId: string | null = selectedClientId || null;
    if (creatingNewClient && newClientName.trim()) {
      try {
        const supabase = getClient();
        await ensureValidSession();
        const { data: newClient, error } = await (supabase as any)
          .from('clients')
          .insert({
            organization_id: organizationId,
            name: newClientName.trim(),
            contact_person: newClientContactPerson.trim() || null,
            email: newClientEmail.trim() || null,
            phone: newClientPhone.trim() || null,
            address: newClientAddress.trim() || null,
            postal_code: newClientPostalCode.trim() || null,
            city: newClientCity.trim() || null,
          } as ClientInsert)
          .select()
          .single();

        if (error) throw error;
        clientId = newClient.id;
        queryClient.invalidateQueries({ queryKey: ['active-clients'] });
        queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      } catch (err: any) {
        toast.error(`Fehler beim Erstellen des Kunden: ${err.message}`);
        return;
      }
    }

    const data: PropertyInsert | PropertyUpdate = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      postal_code: postalCode.trim(),
      type,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      geofence_radius: isNaN(parsedRadius) || parsedRadius < 0 ? 100 : parsedRadius,
      client_id: clientId,
    };

    if (editingProperty) {
      updateMutation.mutate({ id: editingProperty.id, data });
    } else {
      createMutation.mutate(data as PropertyInsert);
    }
  };

  // Filter properties by search and active status
  const filteredProperties = properties.filter((property) => {
    // Filter by active status
    if (!showInactiveProperties && !property.is_active) return false;

    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      property.name.toLowerCase().includes(search) ||
      property.address.toLowerCase().includes(search) ||
      property.city.toLowerCase().includes(search)
    );
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending || isGeocoding;

  if (!permissions.canManageProperties) {
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title="Liegenschaften"
          rightElement={
            <Button size="icon" onClick={() => setShowForm(true)}>
              <Plus className="h-5 w-5" />
            </Button>
          }
        />
      }
    >
      {/* Search and Filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Liegenschaft suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactiveProperties}
            onChange={(e) => setShowInactiveProperties(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-muted-foreground">Inaktive Liegenschaften anzeigen</span>
        </label>
      </div>

      {/* Properties list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Liegenschaften gefunden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProperties.map((property) => {
            const inactive = !property.is_active;
            return (
              <Card key={property.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{property.name}</h3>
                        {isSuperAdmin && property.organizations?.name && (
                          <span className="hidden sm:inline-flex badge bg-purple-100 text-purple-700 text-xs">
                            {property.organizations.name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {property.address}, {property.postal_code} {property.city}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="badge badge-info text-xs">
                          {propertyTypeLabels[property.type]}
                        </span>
                        {inactive && (
                          <span className="badge bg-gray-100 text-gray-700 text-xs">
                            Inaktiv
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (inactive) {
                            // Activate directly
                            toggleActiveMutation.mutate({ propertyId: property.id, isActive: true });
                          } else {
                            // Show confirmation dialog for deactivation
                            setDeactivatingProperty(property);
                            setShowDeactivateDialog(true);
                          }
                        }}
                        title={inactive ? 'Liegenschaft aktivieren' : 'Liegenschaft deaktivieren'}
                        disabled={toggleActiveMutation.isPending}
                      >
                        <Power className={cn('h-4 w-4', inactive ? 'text-green-500' : 'text-gray-400')} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setAssigningProperty(property);
                          setShowUsersSheet(true);
                        }}
                        title="Mitarbeiter zuweisen"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditForm(property)}
                        title="Bearbeiten"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeactivatingProperty(property);
                          setShowDeactivateDialog(true);
                        }}
                        title="Deaktivieren"
                      >
                        <Trash2 className="h-4 w-4 text-error-600" />
                      </Button>
                    </div>
                  </div>
                  {isSuperAdmin && property.organizations?.name && (
                    <span className="sm:hidden block w-full rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 mt-2">
                      {property.organizations.name}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Property form sheet */}
      <Sheet open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>
              {editingProperty ? 'Liegenschaft bearbeiten' : 'Neue Liegenschaft'}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Name <span className="text-error-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Liegenschaftsname"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Adresse <span className="text-error-500">*</span>
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Strasse und Hausnummer"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  PLZ <span className="text-error-500">*</span>
                </label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="8000"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Ort <span className="text-error-500">*</span>
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Zürich"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Typ</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(propertyTypeLabels) as PropertyType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                      type === t
                        ? 'bg-primary-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {propertyTypeLabels[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Breitengrad</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={latitude}
                  onChange={(e) => {
                    setLatitude(e.target.value);
                    if (latitudeError) validateLatitude(e.target.value);
                  }}
                  onBlur={(e) => validateLatitude(e.target.value)}
                  placeholder="47.3769"
                  className={latitudeError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {latitudeError && (
                  <p className="text-xs text-red-500">{latitudeError}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Längengrad</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={longitude}
                  onChange={(e) => {
                    setLongitude(e.target.value);
                    if (longitudeError) validateLongitude(e.target.value);
                  }}
                  onBlur={(e) => validateLongitude(e.target.value)}
                  placeholder="8.5417"
                  className={longitudeError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {longitudeError && (
                  <p className="text-xs text-red-500">{longitudeError}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Geofence-Radius (Meter)</label>
              <Input
                type="number"
                inputMode="decimal"
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(e.target.value)}
                placeholder="100"
              />
            </div>

            {/* Client selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Kunde</label>
              <select
                value={creatingNewClient ? '__new__' : selectedClientId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setCreatingNewClient(true);
                    setSelectedClientId('');
                  } else {
                    setCreatingNewClient(false);
                    setSelectedClientId(e.target.value);
                  }
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Kein Kunde</option>
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
                <option value="__new__">+ Neuen Kunden erstellen</option>
              </select>
            </div>

            {/* Inline new client fields */}
            {creatingNewClient && (
              <div className="space-y-3 rounded-lg border border-dashed border-primary-300 bg-primary-50/50 p-4">
                <p className="text-sm font-medium text-primary-700">Neuer Kunde</p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Name <span className="text-error-500">*</span>
                  </label>
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Firmenname oder Person"
                    required={creatingNewClient}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Kontaktperson</label>
                  <Input
                    value={newClientContactPerson}
                    onChange={(e) => setNewClientContactPerson(e.target.value)}
                    placeholder="Ansprechpartner"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">E-Mail</label>
                    <Input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="email@beispiel.ch"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Telefon</label>
                    <Input
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      placeholder="+41 79 123 45 67"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Adresse</label>
                  <Input
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                    placeholder="Strasse und Hausnummer"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">PLZ</label>
                    <Input
                      value={newClientPostalCode}
                      onChange={(e) => setNewClientPostalCode(e.target.value)}
                      placeholder="8000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ort</label>
                    <Input
                      value={newClientCity}
                      onChange={(e) => setNewClientCity(e.target.value)}
                      placeholder="Zürich"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={resetForm}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting || !name.trim() || !address.trim() || !city.trim() || !postalCode.trim() || !!latitudeError || !!longitudeError || (creatingNewClient && !newClientName.trim())}
              >
                {isGeocoding
                  ? 'Koordinaten werden ermittelt...'
                  : isSubmitting
                  ? 'Wird gespeichert...'
                  : editingProperty
                  ? 'Speichern'
                  : 'Erstellen'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Hard-delete dialog removed — use deactivate instead to preserve historical data */}

      {/* Deactivate confirmation dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liegenschaft deaktivieren</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie &quot;{deactivatingProperty?.name}&quot; deaktivieren möchten?
              Mitarbeiter werden diese Liegenschaft nicht mehr sehen und keine Checklisten oder Aufgaben
              dafür bearbeiten können.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivatingProperty && toggleActiveMutation.mutate({ propertyId: deactivatingProperty.id, isActive: false })}
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending ? 'Wird deaktiviert...' : 'Deaktivieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User assignments sheet */}
      <Sheet open={showUsersSheet} onOpenChange={(open) => {
        setShowUsersSheet(open);
        if (!open) setAssigningProperty(null);
      }}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>
              Mitarbeiter für {assigningProperty?.name}
            </SheetTitle>
          </SheetHeader>

          {/* Bulk action buttons */}
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => assigningProperty && toggleAllUsersMutation.mutate({ propertyId: assigningProperty.id, assign: true })}
              disabled={toggleAllUsersMutation.isPending || !assigningProperty || propertyAssignments.length === allUsers.length}
            >
              Allen zuweisen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => assigningProperty && toggleAllUsersMutation.mutate({ propertyId: assigningProperty.id, assign: false })}
              disabled={toggleAllUsersMutation.isPending || !assigningProperty || propertyAssignments.length === 0}
            >
              Alle entfernen
            </Button>
          </div>

          <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(70vh-160px)]">
            {allUsers.map((user) => {
              const isAssigned = propertyAssignments.includes(user.id);
              const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Kein Name';
              const initials = getInitials(user.first_name, user.last_name);

              return (
                <button
                  key={user.id}
                  onClick={() =>
                    assigningProperty &&
                    toggleUserAssignmentMutation.mutate({
                      propertyId: assigningProperty.id,
                      userId: user.id,
                      assign: !isAssigned,
                    })
                  }
                  className={cn(
                    'w-full p-3 text-left rounded-lg border transition-colors flex items-center justify-between',
                    isAssigned
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-muted hover:border-primary-300'
                  )}
                  disabled={toggleUserAssignmentMutation.isPending}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary-700">
                        {initials}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{fullName}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center',
                      isAssigned
                        ? 'bg-primary-600 border-primary-600'
                        : 'border-muted-foreground'
                    )}
                  >
                    {isAssigned && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

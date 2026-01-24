'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, MapPin, Edit, Trash2, Search } from 'lucide-react';
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
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Property, PropertyInsert, PropertyUpdate, PropertyType } from '@/types/database';

const propertyTypeLabels: Record<PropertyType, string> = {
  residential: 'Wohngebäude',
  commercial: 'Gewerbe',
  industrial: 'Industrie',
  mixed: 'Gemischt',
};

export default function AdminPropertiesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [type, setType] = useState<PropertyType>('residential');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geofenceRadius, setGeofenceRadius] = useState('100');

  // Fetch properties
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('properties')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Property[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: PropertyInsert) => {
      const supabase = getClient();
      const { data: result, error } = await (supabase as any)
        .from('properties')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
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
      const { data: result, error } = await (supabase as any)
        .from('properties')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('properties')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Liegenschaft wurde gelöscht');
      queryClient.invalidateQueries({ queryKey: ['admin-properties'] });
      setShowDeleteDialog(false);
      setDeletingProperty(null);
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
    setEditingProperty(property);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: PropertyInsert | PropertyUpdate = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      postal_code: postalCode.trim(),
      type,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      geofence_radius: parseInt(geofenceRadius) || 100,
    };

    if (editingProperty) {
      updateMutation.mutate({ id: editingProperty.id, data });
    } else {
      createMutation.mutate(data as PropertyInsert);
    }
  };

  // Filter properties by search
  const filteredProperties = properties.filter((property) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      property.name.toLowerCase().includes(search) ||
      property.address.toLowerCase().includes(search) ||
      property.city.toLowerCase().includes(search)
    );
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (!permissions.canManageProperties) {
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title="Liegenschaften"
          showBack
          rightElement={
            <Button size="icon" onClick={() => setShowForm(true)}>
              <Plus className="h-5 w-5" />
            </Button>
          }
        />
      }
    >
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Liegenschaft suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
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
          {filteredProperties.map((property) => (
            <Card key={property.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{property.name}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {property.address}, {property.postal_code} {property.city}
                    </p>
                    <span className="badge badge-info text-xs mt-2">
                      {propertyTypeLabels[property.type]}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditForm(property)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeletingProperty(property);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-error-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="47.3769"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Längengrad</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="8.5417"
                />
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
                disabled={isSubmitting || !name.trim() || !address.trim() || !city.trim() || !postalCode.trim()}
              >
                {isSubmitting
                  ? 'Wird gespeichert...'
                  : editingProperty
                  ? 'Speichern'
                  : 'Erstellen'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liegenschaft löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie &quot;{deletingProperty?.name}&quot; löschen möchten?
              Alle zugehörigen Daten (Zeiteinträge, Meldungen, Checklisten) werden ebenfalls gelöscht.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingProperty && deleteMutation.mutate(deletingProperty.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Wird gelöscht...' : 'Löschen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

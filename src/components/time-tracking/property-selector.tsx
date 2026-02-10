'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapPin, Building2, Search, Navigation, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn, calculateDistance } from '@/lib/utils';
import type { Property } from '@/types/database';

interface PropertySelectorProps {
  properties: Property[];
  selectedProperty: Property | null;
  onSelect: (property: Property) => void;
  userCoords?: { lat: number; lng: number } | null;
  isLoadingLocation?: boolean;
  onRequestLocation?: () => void;
  autoSelectNearest?: boolean;
  className?: string;
}

export function PropertySelector({
  properties,
  selectedProperty,
  onSelect,
  userCoords,
  isLoadingLocation = false,
  onRequestLocation,
  autoSelectNearest = false,
  className,
}: PropertySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Auto-select nearest property when coords become available
  useEffect(() => {
    if (autoSelectNearest && userCoords && !selectedProperty && properties.length > 0) {
      const nearest = [...properties]
        .filter((p) => p.latitude && p.longitude)
        .sort((a, b) => {
          const distA = calculateDistance(userCoords.lat, userCoords.lng, a.latitude!, a.longitude!);
          const distB = calculateDistance(userCoords.lat, userCoords.lng, b.latitude!, b.longitude!);
          return distA - distB;
        })[0];
      if (nearest) {
        onSelect(nearest);
      }
    }
  }, [autoSelectNearest, userCoords, selectedProperty, properties, onSelect]);

  // Filter properties by search (memoized)
  const filteredProperties = useMemo(() =>
    properties.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase())
    ), [properties, search]);

  // Sort by distance if user coords available (memoized)
  const sortedProperties = useMemo(() =>
    userCoords
      ? [...filteredProperties].sort((a, b) => {
          if (!a.latitude || !a.longitude) return 1;
          if (!b.latitude || !b.longitude) return -1;
          const distA = calculateDistance(
            userCoords.lat,
            userCoords.lng,
            a.latitude,
            a.longitude
          );
          const distB = calculateDistance(
            userCoords.lat,
            userCoords.lng,
            b.latitude,
            b.longitude
          );
          return distA - distB;
        })
      : filteredProperties
  , [filteredProperties, userCoords]);

  const handleSelect = (property: Property) => {
    onSelect(property);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={className}>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="touch"
            className="w-full justify-between"
          >
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className={cn(!selectedProperty && 'text-muted-foreground')}>
                {selectedProperty?.name || 'Liegenschaft wählen'}
              </span>
            </div>
            <MapPin className="h-5 w-5 text-muted-foreground" />
          </Button>
        </SheetTrigger>

        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>Liegenschaft wählen</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Location button */}
            {onRequestLocation && (
              <Button
                variant="outline"
                className="w-full"
                onClick={onRequestLocation}
                disabled={isLoadingLocation}
              >
                {isLoadingLocation ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                {userCoords ? 'Standort aktualisieren' : 'Standort ermitteln'}
              </Button>
            )}

            {/* Search input */}
            <Input
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftElement={<Search className="h-4 w-4 text-muted-foreground" />}
              aria-label="Liegenschaft suchen"
            />

            {/* Property list */}
            <div className="space-y-2 overflow-y-auto max-h-[calc(80vh-200px)]">
              {sortedProperties.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Keine Liegenschaften gefunden
                </p>
              ) : (
                sortedProperties.map((property) => {
                  const distance =
                    userCoords && property.latitude && property.longitude
                      ? calculateDistance(
                          userCoords.lat,
                          userCoords.lng,
                          property.latitude,
                          property.longitude
                        )
                      : null;

                  return (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      distance={distance}
                      isSelected={selectedProperty?.id === property.id}
                      onClick={() => handleSelect(property)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface PropertyCardProps {
  property: Property;
  distance?: number | null;
  isSelected?: boolean;
  onClick: () => void;
}

function PropertyCard({
  property,
  distance,
  isSelected = false,
  onClick,
}: PropertyCardProps) {
  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  return (
    <Card
      interactive
      onClick={onClick}
      className={cn(
        'p-4',
        isSelected && 'border-primary-500 bg-primary-50'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'rounded-lg p-2',
            isSelected ? 'bg-primary-100' : 'bg-muted'
          )}
        >
          <Building2
            className={cn(
              'h-5 w-5',
              isSelected ? 'text-primary-600' : 'text-muted-foreground'
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{property.name}</h3>
          <p className="text-sm text-muted-foreground truncate">
            {property.address}, {property.postal_code} {property.city}
          </p>
        </div>

        {distance !== null && distance !== undefined && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0">
            <MapPin className="h-4 w-4" />
            <span>{formatDistance(distance)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// Compact property display (for header/info sections)
interface PropertyDisplayProps {
  property: Property | null;
  className?: string;
}

export function PropertyDisplay({ property, className }: PropertyDisplayProps) {
  if (!property) {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
        <Building2 className="h-4 w-4" />
        <span className="text-sm">Keine Liegenschaft</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Building2 className="h-4 w-4 text-primary-600" />
      <span className="text-sm font-medium truncate">{property.name}</span>
    </div>
  );
}

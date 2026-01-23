'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Sparkles, Shield, Wrench, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { PhotoCapture } from './photo-capture';
import { PropertySelector, PropertyDisplay } from '@/components/time-tracking/property-selector';
import { issueSchema, type IssueFormData } from '@/lib/validations';
import { cn } from '@/lib/utils';
import type { Property, IssueCategory, IssuePriority } from '@/types/database';

interface IssueFormProps {
  properties: Property[];
  selectedProperty?: Property | null;
  userCoords?: { lat: number; lng: number } | null;
  onSubmit: (data: IssueFormData) => Promise<void>;
  isSubmitting?: boolean;
  initialData?: Partial<IssueFormData>;
  className?: string;
}

const categories: { value: IssueCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'damage', label: 'Schaden', icon: AlertTriangle },
  { value: 'cleaning', label: 'Reinigung', icon: Sparkles },
  { value: 'safety', label: 'Sicherheit', icon: Shield },
  { value: 'maintenance', label: 'Wartung', icon: Wrench },
  { value: 'other', label: 'Sonstiges', icon: HelpCircle },
];

const priorities: { value: IssuePriority; label: string; color: string }[] = [
  { value: 'low', label: 'Niedrig', color: 'bg-muted text-muted-foreground' },
  { value: 'medium', label: 'Mittel', color: 'bg-primary-100 text-primary-700' },
  { value: 'high', label: 'Hoch', color: 'bg-warning-100 text-warning-700' },
  { value: 'urgent', label: 'Dringend', color: 'bg-error-100 text-error-700' },
];

export function IssueForm({
  properties,
  selectedProperty,
  userCoords,
  onSubmit,
  isSubmitting = false,
  initialData,
  className,
}: IssueFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<IssueFormData>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      propertyId: selectedProperty?.id || initialData?.propertyId || '',
      category: initialData?.category || 'damage',
      priority: initialData?.priority || 'medium',
      title: initialData?.title || '',
      description: initialData?.description || '',
      photoUrls: initialData?.photoUrls || [],
    },
  });

  const currentCategory = watch('category');
  const currentPriority = watch('priority');
  const photoUrls = watch('photoUrls') || [];

  const handlePropertySelect = (property: Property) => {
    setValue('propertyId', property.id);
  };

  const handlePhotosChange = (photos: string[]) => {
    setValue('photoUrls', photos);
  };

  const currentSelectedProperty = properties.find(
    (p) => p.id === watch('propertyId')
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn('space-y-6', className)}
    >
      {/* Property selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Liegenschaft</label>
        <PropertySelector
          properties={properties}
          selectedProperty={currentSelectedProperty || null}
          onSelect={handlePropertySelect}
          userCoords={userCoords}
        />
        {errors.propertyId && (
          <p className="text-sm text-error-600">{errors.propertyId.message}</p>
        )}
      </div>

      {/* Category selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Kategorie</label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = currentCategory === cat.value;

            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setValue('category', cat.value)}
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-lg border transition-all',
                  isSelected
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-border hover:border-primary-300'
                )}
              >
                <Icon className={cn('h-5 w-5', isSelected ? 'text-primary-600' : 'text-muted-foreground')} />
                <span className="text-xs font-medium">{cat.label}</span>
              </button>
            );
          })}
        </div>
        {errors.category && (
          <p className="text-sm text-error-600">{errors.category.message}</p>
        )}
      </div>

      {/* Priority selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Priorität</label>
        <div className="flex gap-2">
          {priorities.map((pri) => {
            const isSelected = currentPriority === pri.value;

            return (
              <button
                key={pri.value}
                type="button"
                onClick={() => setValue('priority', pri.value)}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                  isSelected
                    ? pri.color + ' ring-2 ring-offset-2 ring-primary-500'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {pri.label}
              </button>
            );
          })}
        </div>
        {errors.priority && (
          <p className="text-sm text-error-600">{errors.priority.message}</p>
        )}
      </div>

      {/* Title */}
      <Input
        label="Titel"
        placeholder="Kurze Beschreibung des Problems"
        error={errors.title?.message}
        {...register('title')}
      />

      {/* Description */}
      <Textarea
        label="Beschreibung (optional)"
        placeholder="Detaillierte Beschreibung..."
        error={errors.description?.message}
        {...register('description')}
      />

      {/* Photo capture */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Fotos (optional)</label>
        <PhotoCapture
          photos={photoUrls}
          onPhotosChange={handlePhotosChange}
          maxPhotos={5}
        />
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        size="touch"
        className="w-full"
        isLoading={isSubmitting}
        loadingText="Wird gemeldet..."
      >
        Problem melden
      </Button>
    </form>
  );
}

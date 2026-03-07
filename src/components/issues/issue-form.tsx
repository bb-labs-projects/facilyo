'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Sparkles, Shield, Wrench, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { PhotoCapture } from './photo-capture';
import { PropertySelector, PropertyDisplay } from '@/components/time-tracking/property-selector';
import { issueSchema, type IssueFormData } from '@/lib/validations';
import { useTranslations } from 'next-intl';
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

const categories: { value: IssueCategory; key: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'damage', key: 'damage', icon: AlertTriangle },
  { value: 'cleaning', key: 'cleaning', icon: Sparkles },
  { value: 'safety', key: 'safety', icon: Shield },
  { value: 'maintenance', key: 'maintenance', icon: Wrench },
  { value: 'other', key: 'other', icon: HelpCircle },
];

const priorities: { value: IssuePriority; key: string; color: string }[] = [
  { value: 'low', key: 'low', color: 'bg-muted text-muted-foreground' },
  { value: 'medium', key: 'medium', color: 'bg-primary-100 text-primary-700' },
  { value: 'high', key: 'high', color: 'bg-warning-100 text-warning-700' },
  { value: 'urgent', key: 'urgent', color: 'bg-error-100 text-error-700' },
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
  const tIssue = useTranslations('issues');
  const tc = useTranslations('common');
  const tProp = useTranslations('properties');
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
      <div className="space-y-2" role="group" aria-labelledby="issue-property-label">
        <span id="issue-property-label" className="text-sm font-medium">{tProp('singular')}</span>
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
      <div className="space-y-2" role="group" aria-labelledby="issue-category-label">
        <span id="issue-category-label" className="text-sm font-medium">{tIssue('category')}</span>
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
                <span className="text-xs font-medium">{tIssue(`categories.${cat.key}`)}</span>
              </button>
            );
          })}
        </div>
        {errors.category && (
          <p className="text-sm text-error-600">{errors.category.message}</p>
        )}
      </div>

      {/* Priority selector */}
      <div className="space-y-2" role="group" aria-labelledby="issue-priority-label">
        <span id="issue-priority-label" className="text-sm font-medium">{tIssue('priority')}</span>
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
                {tIssue(`priorities.${pri.key}`)}
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
        label={tc('title')}
        placeholder={tIssue('titlePlaceholder')}
        error={errors.title?.message}
        {...register('title')}
      />

      {/* Description */}
      <Textarea
        label={tIssue('descriptionOptional')}
        placeholder={tIssue('descriptionPlaceholder')}
        error={errors.description?.message}
        {...register('description')}
      />

      {/* Photo capture */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{tIssue('photosOptional')}</label>
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
        loadingText={tIssue('reporting')}
      >
        {tIssue('create')}
      </Button>
    </form>
  );
}

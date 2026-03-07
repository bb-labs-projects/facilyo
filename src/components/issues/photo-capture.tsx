'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, X, Plus, Image, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
// browser-image-compression is dynamically imported when needed to reduce initial bundle size
import { Button } from '@/components/ui/button';
import { cn, hapticFeedback } from '@/lib/utils';
import { getClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

interface PhotoCaptureProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  className?: string;
}

export function PhotoCapture({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  className,
}: PhotoCaptureProps) {
  const organizationId = useAuthStore((state) => state.organizationId);
  const t = useTranslations('photoCapture');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const compressImage = async (file: File): Promise<File> => {
    try {
      // Dynamic import to reduce initial bundle size
      const imageCompression = (await import('browser-image-compression')).default;
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      return await imageCompression(file, options);
    } catch {
      // Return original file if compression fails
      return file;
    }
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const supabase = getClient();

    // Compress image
    const compressedFile = await compressImage(file);

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
    const path = `${organizationId}/issues/${filename}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('photos')
      .upload(path, compressedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('photos').getPublicUrl(data.path);

    return publicUrl;
  };

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const remainingSlots = maxPhotos - photos.length;
      if (remainingSlots <= 0) return;

      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      setIsUploading(true);
      setUploadProgress(0);
      hapticFeedback('light');

      try {
        const uploadedUrls: string[] = [];
        const total = filesToProcess.length;

        for (let i = 0; i < filesToProcess.length; i++) {
          const url = await uploadPhoto(filesToProcess[i]);
          uploadedUrls.push(url);
          setUploadProgress(((i + 1) / total) * 100);
        }

        onPhotosChange([...photos, ...uploadedUrls]);
        hapticFeedback('medium');
      } catch (error: any) {
        console.error('Failed to upload photo:', error);
        toast.error(error?.message || t('uploadError'));
        hapticFeedback('heavy');
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos, onPhotosChange, maxPhotos]
  );

  const handleRemovePhoto = useCallback(
    (index: number) => {
      hapticFeedback('light');
      const newPhotos = photos.filter((_, i) => i !== index);
      onPhotosChange(newPhotos);
    },
    [photos, onPhotosChange]
  );

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const openGallery = () => {
    fileInputRef.current?.click();
  };

  const canAddMore = photos.length < maxPhotos;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url, index) => (
            <div
              key={url}
              className="relative w-[200px] h-[200px] rounded-lg overflow-hidden bg-slate-100 border border-slate-200"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full"
              >
                <img
                  src={url}
                  alt={t('photoAlt', { index: index + 1 })}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemovePhoto(index);
                }}
                className="absolute top-0.5 right-0.5 p-0.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-error-500 text-white rounded-full shadow-md"
                aria-label={t('removePhoto')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('uploading')}</span>
          </div>
          <div
            className="h-2 bg-muted rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(uploadProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('uploadProgress')}
          >
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Add buttons */}
      {canAddMore && !isUploading && (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={openCamera}
          >
            <Camera className="h-4 w-4 mr-2" />
            {t('camera')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={openGallery}
          >
            <Image className="h-4 w-4 mr-2" aria-hidden="true" />
            {t('gallery')}
          </Button>
        </div>
      )}

      {/* Photo count */}
      <p className="text-xs text-muted-foreground text-center">
        {t('photoCount', { current: photos.length, max: maxPhotos })}
      </p>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
        aria-label={t('takePhoto')}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
        aria-label={t('selectFromGallery')}
      />
    </div>
  );
}

// Compact photo preview
interface PhotoPreviewProps {
  photos: string[];
  maxDisplay?: number;
  className?: string;
}

export function PhotoPreview({
  photos,
  maxDisplay = 3,
  className,
}: PhotoPreviewProps) {
  if (photos.length === 0) {
    return null;
  }

  const displayPhotos = photos.slice(0, maxDisplay);
  const remaining = photos.length - maxDisplay;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {displayPhotos.map((url, index) => (
        <div
          key={url}
          className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0"
        >
          <img
            src={url}
            alt={`Photo ${index + 1}`}
            className="w-full h-full object-cover"
            width={32}
            height={32}
            loading="lazy"
          />
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
          +{remaining}
        </div>
      )}
    </div>
  );
}

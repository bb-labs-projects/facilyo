'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, X, Plus, Image, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { cn, hapticFeedback } from '@/lib/utils';
import { getClient } from '@/lib/supabase/client';

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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };
    return imageCompression(file, options);
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const supabase = getClient();

    // Compress image
    const compressedFile = await compressImage(file);

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
    const path = `issues/${filename}`;

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
      } catch (error) {
        console.error('Failed to upload photo:', error);
        hapticFeedback('heavy');
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
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
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, index) => (
            <div
              key={url}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted"
            >
              <img
                src={url}
                alt={`Foto ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                className="absolute top-1 right-1 p-1 bg-error-500 text-white rounded-full shadow-md"
                aria-label="Foto entfernen"
              >
                <X className="h-4 w-4" />
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
            <span>Wird hochgeladen...</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
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
            Kamera
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={openGallery}
          >
            <Image className="h-4 w-4 mr-2" />
            Galerie
          </Button>
        </div>
      )}

      {/* Photo count */}
      <p className="text-xs text-muted-foreground text-center">
        {photos.length} von {maxPhotos} Fotos
      </p>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
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
            alt={`Foto ${index + 1}`}
            className="w-full h-full object-cover"
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

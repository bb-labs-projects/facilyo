'use client';

import { useState, useRef } from 'react';
import { Check, Camera, GripVertical, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
// browser-image-compression is dynamically imported when needed to reduce initial bundle size
import { Input } from '@/components/ui/input';
import { cn, hapticFeedback } from '@/lib/utils';
import { getClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { ChecklistItem as ChecklistItemType } from '@/types/database';

interface ChecklistItemProps {
  item: ChecklistItemType;
  value: unknown;
  onChange: (value: unknown) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  className?: string;
}

export function ChecklistItem({
  item,
  value,
  onChange,
  isDragging = false,
  dragHandleProps,
  className,
}: ChecklistItemProps) {
  const renderInput = () => {
    switch (item.type) {
      case 'checkbox':
        return (
          <CheckboxInput
            checked={value as boolean}
            onChange={(checked) => onChange(checked)}
            label={item.label}
            required={item.required}
          />
        );

      case 'text':
        return (
          <TextInput
            value={value as string}
            onChange={(text) => onChange(text)}
            label={item.label}
            required={item.required}
          />
        );

      case 'number':
        return (
          <NumberInput
            value={value as number}
            onChange={(num) => onChange(num)}
            label={item.label}
            required={item.required}
          />
        );

      case 'photo':
        return (
          <PhotoInput
            value={value as string}
            onChange={(url) => onChange(url)}
            label={item.label}
            required={item.required}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 bg-background rounded-lg border',
        isDragging && 'shadow-lg border-primary-500',
        className
      )}
    >
      {dragHandleProps && (
        <button
          aria-label="Element verschieben"
          className="mt-1 text-muted-foreground hover:text-foreground touch-none min-h-[44px] min-w-[44px] flex items-center justify-center p-3 -m-3"
          {...dragHandleProps}
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      <div className="flex-1">{renderInput()}</div>
    </div>
  );
}

// Checkbox input component
interface CheckboxInputProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  required?: boolean;
}

function CheckboxInput({ checked, onChange, label, required }: CheckboxInputProps) {
  const handleClick = () => {
    hapticFeedback('light');
    onChange(!checked);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-3 w-full text-left"
    >
      <div
        className={cn(
          'flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all',
          checked
            ? 'bg-primary-600 border-primary-600'
            : 'border-muted-foreground/50 hover:border-primary-500'
        )}
      >
        <AnimatePresence>
          {checked && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="h-4 w-4 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span
        className={cn(
          'text-sm transition-all',
          checked && 'text-muted-foreground line-through'
        )}
      >
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </span>
    </button>
  );
}

// Text input component
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}

function TextInput({ value, onChange, label, required }: TextInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </label>
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Eingeben..."
      />
    </div>
  );
}

// Number input component
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  required?: boolean;
}

function NumberInput({ value, onChange, label, required }: NumberInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </label>
      <Input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
      />
    </div>
  );
}

// Photo input component with upload functionality
interface PhotoInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}

function PhotoInput({ value, onChange, label, required }: PhotoInputProps) {
  const organizationId = useAuthStore((state) => state.organizationId);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      return file;
    }
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const supabase = getClient();

    const compressedFile = await compressImage(file);

    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
    const path = `${organizationId}/checklists/${filename}`;

    const { data, error } = await supabase.storage
      .from('photos')
      .upload(path, compressedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from('photos').getPublicUrl(data.path);

    return publicUrl;
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    hapticFeedback('light');

    try {
      const url = await uploadPhoto(files[0]);
      onChange(url);
      hapticFeedback('medium');
    } catch (error: any) {
      console.error('Failed to upload photo:', error);
      toast.error(error?.message || 'Foto konnte nicht hochgeladen werden');
      hapticFeedback('heavy');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    hapticFeedback('light');
    onChange('');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </label>

      {isUploading ? (
        <div className="w-full h-32 border-2 border-dashed border-primary-300 rounded-lg flex flex-col items-center justify-center gap-2 bg-primary-50">
          <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
          <span className="text-sm text-primary-600">Wird hochgeladen...</span>
        </div>
      ) : value ? (
        <div className="relative">
          <img
            src={value}
            alt={`Foto für ${label}`}
            className="w-full h-32 object-cover rounded-lg"
            width={320}
            height={128}
            loading="lazy"
          />
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Foto entfernen"
            className="absolute top-2 right-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-error-500 text-white p-1.5 rounded-full shadow-md hover:bg-error-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-32 border-2 border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary-500 transition-colors"
        >
          <Camera className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Foto aufnehmen</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
        aria-label="Foto aufnehmen"
      />
    </div>
  );
}

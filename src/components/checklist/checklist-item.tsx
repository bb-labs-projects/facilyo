'use client';

import { useState } from 'react';
import { Check, Camera, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { cn, hapticFeedback } from '@/lib/utils';
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
          className="mt-1 text-muted-foreground hover:text-foreground touch-none"
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
        value={value ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
      />
    </div>
  );
}

// Photo input component (placeholder - full implementation in photo-capture)
interface PhotoInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}

function PhotoInput({ value, onChange, label, required }: PhotoInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </label>

      {value ? (
        <div className="relative">
          <img
            src={value}
            alt="Captured"
            className="w-full h-32 object-cover rounded-lg"
          />
          <button
            onClick={() => onChange('')}
            className="absolute top-2 right-2 bg-error-500 text-white p-1 rounded-full"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            // Photo capture will be handled by parent
          }}
          className="w-full h-32 border-2 border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary-500 transition-colors"
        >
          <Camera className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Foto aufnehmen</span>
        </button>
      )}
    </div>
  );
}

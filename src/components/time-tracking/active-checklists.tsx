'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, ChevronDown, ChevronUp, Check, Camera, Save, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
// browser-image-compression is dynamically imported when needed to reduce initial bundle size
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getClient } from '@/lib/supabase/client';
import { cn, hapticFeedback } from '@/lib/utils';
import type { ChecklistTemplate, ChecklistItem, Property } from '@/types/database';

interface ChecklistWithProperty extends ChecklistTemplate {
  property: Property;
}

interface ChecklistInstance {
  id: string;
  template_id: string;
  time_entry_id: string;
  completed_items: Record<string, unknown>;
}

interface ActiveChecklistsProps {
  propertyId: string;
  timeEntryId: string;
  className?: string;
}

export function ActiveChecklists({ propertyId, timeEntryId, className }: ActiveChecklistsProps) {
  const queryClient = useQueryClient();
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null);
  // Local state for unsaved changes per checklist
  const [localChanges, setLocalChanges] = useState<Record<string, Record<string, unknown>>>({});
  // Track which checklist is currently being saved
  const [savingChecklistId, setSavingChecklistId] = useState<string | null>(null);

  // Fetch checklists for the property
  const { data: checklists = [] } = useQuery({
    queryKey: ['property-checklists', propertyId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*, property:properties(*)')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as ChecklistWithProperty[];
    },
    enabled: !!propertyId,
  });

  // Fetch existing checklist instances for this time entry
  const { data: instances = [] } = useQuery({
    queryKey: ['checklist-instances', timeEntryId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('checklist_instances')
        .select('*')
        .eq('time_entry_id', timeEntryId);

      if (error) throw error;
      return data as ChecklistInstance[];
    },
    enabled: !!timeEntryId,
  });

  // Initialize local changes from instances when they load
  useEffect(() => {
    if (instances.length > 0) {
      const initialChanges: Record<string, Record<string, unknown>> = {};
      instances.forEach((instance) => {
        initialChanges[instance.template_id] = instance.completed_items || {};
      });
      setLocalChanges((prev) => {
        // Only set if not already set (to preserve unsaved changes)
        const merged = { ...initialChanges };
        Object.keys(prev).forEach((key) => {
          if (prev[key] && Object.keys(prev[key]).length > 0) {
            merged[key] = prev[key];
          }
        });
        return merged;
      });
    }
  }, [instances]);

  // Create or update checklist instance
  const upsertInstanceMutation = useMutation({
    mutationFn: async ({
      templateId,
      completedItems,
    }: {
      templateId: string;
      completedItems: Record<string, unknown>;
    }) => {
      const supabase = getClient();
      const existingInstance = instances.find((i) => i.template_id === templateId);

      if (existingInstance) {
        // Update existing
        const { error } = await (supabase as any)
          .from('checklist_instances')
          .update({ completed_items: completedItems, updated_at: new Date().toISOString() })
          .eq('id', existingInstance.id);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await (supabase as any)
          .from('checklist_instances')
          .insert({
            template_id: templateId,
            time_entry_id: timeEntryId,
            completed_items: completedItems,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      hapticFeedback('medium');
      toast.success('Checkliste gespeichert');
      queryClient.invalidateQueries({ queryKey: ['checklist-instances', timeEntryId] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler beim Speichern: ${error.message}`);
    },
  });

  const getSavedItems = useCallback((templateId: string): Record<string, unknown> => {
    const instance = instances.find((i) => i.template_id === templateId);
    return instance?.completed_items || {};
  }, [instances]);

  const getLocalItems = useCallback((templateId: string): Record<string, unknown> => {
    return localChanges[templateId] || getSavedItems(templateId);
  }, [localChanges, getSavedItems]);

  const handleItemChange = useCallback((templateId: string, itemId: string, value: unknown) => {
    setLocalChanges((prev) => ({
      ...prev,
      [templateId]: {
        ...(prev[templateId] || getSavedItems(templateId)),
        [itemId]: value,
      },
    }));
  }, [getSavedItems]);

  const validateRequiredFields = useCallback((templateId: string): { valid: boolean; missingFields: string[] } => {
    const checklist = checklists.find(c => c.id === templateId);
    if (!checklist) return { valid: true, missingFields: [] };

    const items = (checklist.items as unknown as ChecklistItem[]) || [];
    const completedItems = getLocalItems(templateId);
    const missingFields: string[] = [];

    items.forEach((item) => {
      if (!item.required) return;

      const value = completedItems[item.id];
      let isValid = false;

      if (item.type === 'checkbox') {
        isValid = value === true;
      } else if (item.type === 'text') {
        isValid = typeof value === 'string' && value.trim() !== '';
      } else if (item.type === 'number') {
        isValid = typeof value === 'number' || (typeof value === 'string' && value !== '');
      } else if (item.type === 'photo') {
        isValid = typeof value === 'string' && value !== '';
      }

      if (!isValid) {
        missingFields.push(item.label);
      }
    });

    return { valid: missingFields.length === 0, missingFields };
  }, [checklists, getLocalItems]);

  const handleSave = useCallback(async (templateId: string) => {
    const validation = validateRequiredFields(templateId);

    if (!validation.valid) {
      toast.error(`Bitte füllen Sie alle Pflichtfelder aus: ${validation.missingFields.join(', ')}`);
      return;
    }

    setSavingChecklistId(templateId);
    const items = getLocalItems(templateId);

    try {
      await upsertInstanceMutation.mutateAsync({ templateId, completedItems: items });
    } finally {
      setSavingChecklistId(null);
    }
  }, [getLocalItems, upsertInstanceMutation, validateRequiredFields]);

  const hasUnsavedChanges = useCallback((templateId: string): boolean => {
    const local = localChanges[templateId];
    if (!local) return false;
    const saved = getSavedItems(templateId);
    return JSON.stringify(local) !== JSON.stringify(saved);
  }, [localChanges, getSavedItems]);

  const getCompletionProgress = (checklist: ChecklistTemplate): { completed: number; total: number } => {
    const items = (checklist.items as unknown as ChecklistItem[]) || [];
    const completedItems = getLocalItems(checklist.id);

    const completed = items.filter((item) => {
      const value = completedItems[item.id];
      if (item.type === 'checkbox') return value === true;
      if (item.type === 'text') return typeof value === 'string' && value.trim() !== '';
      if (item.type === 'number') return typeof value === 'number' || (typeof value === 'string' && value !== '');
      if (item.type === 'photo') return typeof value === 'string' && value !== '';
      return false;
    }).length;

    return { completed, total: items.length };
  };

  if (checklists.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <ClipboardList className="h-4 w-4" />
        Checklisten
      </h3>

      {checklists.map((checklist) => {
        const items = (checklist.items as unknown as ChecklistItem[]) || [];
        const isExpanded = expandedChecklist === checklist.id;
        const progress = getCompletionProgress(checklist);
        const localItems = getLocalItems(checklist.id);
        const hasChanges = hasUnsavedChanges(checklist.id);

        return (
          <Card key={checklist.id} className="overflow-hidden">
            <button
              onClick={() => setExpandedChecklist(isExpanded ? null : checklist.id)}
              className="w-full text-left"
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{checklist.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {progress.completed} von {progress.total} erledigt
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <span className="badge badge-warning text-xs">Nicht gespeichert</span>
                    )}
                    {!hasChanges && progress.completed === progress.total && progress.total > 0 && (
                      <span className="badge badge-success text-xs">Fertig</span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </CardHeader>
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <CardContent className="pt-0 pb-4 px-4 space-y-3">
                    {items.map((item) => (
                      <ChecklistItemInput
                        key={item.id}
                        item={item}
                        value={localItems[item.id]}
                        onChange={(value) => handleItemChange(checklist.id, item.id, value)}
                      />
                    ))}

                    {/* Save button */}
                    <Button
                      onClick={() => handleSave(checklist.id)}
                      disabled={savingChecklistId === checklist.id}
                      className="w-full mt-4"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savingChecklistId === checklist.id ? 'Wird gespeichert...' : 'Speichern'}
                    </Button>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}
    </div>
  );
}

interface ChecklistItemInputProps {
  item: ChecklistItem;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ChecklistItemInput({ item, value, onChange }: ChecklistItemInputProps) {
  switch (item.type) {
    case 'checkbox':
      return (
        <CheckboxItem
          label={item.label}
          checked={value as boolean}
          onChange={onChange}
          required={item.required}
        />
      );
    case 'text':
      return (
        <TextItem
          label={item.label}
          value={value as string}
          onChange={onChange}
          required={item.required}
        />
      );
    case 'number':
      return (
        <NumberItem
          label={item.label}
          value={value as number}
          onChange={onChange}
          required={item.required}
        />
      );
    case 'photo':
      return (
        <PhotoItem
          label={item.label}
          value={value as string}
          onChange={onChange}
          required={item.required}
        />
      );
    default:
      return null;
  }
}

function CheckboxItem({
  label,
  checked,
  onChange,
  required,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  required?: boolean;
}) {
  const handleClick = () => {
    hapticFeedback('light');
    onChange(!checked);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-3 w-full text-left p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors min-h-[44px]"
    >
      <div className="flex items-center justify-center min-h-[44px] min-w-[44px] -ml-1.5">
        <div
          className={cn(
            'w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all',
            checked
              ? 'bg-primary-600 border-primary-600'
              : 'border-muted-foreground/50'
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
      </div>
      <span className={cn('text-sm', checked && 'text-muted-foreground line-through')}>
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </span>
    </button>
  );
}

function TextItem({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
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

function NumberItem({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
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

function PhotoItem({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
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
    const path = `checklists/${filename}`;

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
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-error-500 ml-1">*</span>}
      </label>

      {isUploading ? (
        <div className="w-full h-24 border-2 border-dashed border-primary-300 rounded-lg flex flex-col items-center justify-center gap-2 bg-primary-50">
          <Loader2 className="h-6 w-6 text-primary-500 animate-spin" />
          <span className="text-sm text-primary-600">Wird hochgeladen...</span>
        </div>
      ) : value ? (
        <div className="relative w-[200px] h-[200px] rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full"
          >
            <img
              src={value}
              alt="Aufgenommen"
              className="w-full h-full object-contain"
            />
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRemove();
            }}
            className="absolute top-0.5 right-0.5 p-0.5 bg-error-500 text-white rounded-full shadow-md"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-24 border-2 border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary-500 transition-colors"
        >
          <Camera className="h-6 w-6 text-muted-foreground" />
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
      />
    </div>
  );
}

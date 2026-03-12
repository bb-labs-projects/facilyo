'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Plus,
  Edit,
  Trash2,
  Copy,
  GripVertical,
  Check,
  Type,
  Hash,
  Camera,
  ImagePlus,
  FileText,
  Loader2,
  X,
  Filter,
} from 'lucide-react';
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
import { useTranslations } from 'next-intl';
import { usePermissions } from '@/hooks/use-permissions';
import { useLocale, getChecklistItemLabel } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  ChecklistTemplate,
  Property,
  ChecklistItem,
  ChecklistItemType,
} from '@/types/database';

interface ChecklistTemplateWithProperty extends ChecklistTemplate {
  property: Property;
  organizations?: { name: string };
}

const isPdfUrl = (url: string) => /\.pdf(\?|$)/i.test(url);

export default function AdminChecklistsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const tCheck = useTranslations('checklistAdmin');
  const { locale } = useLocale();

  const itemTypeConfig: Record<ChecklistItemType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    checkbox: { label: tCheck('itemTypes.checkbox'), icon: Check },
    text: { label: tCheck('itemTypes.text'), icon: Type },
    number: { label: tCheck('itemTypes.number'), icon: Hash },
    photo: { label: tCheck('itemTypes.photo'), icon: Camera },
  };

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplateWithProperty | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<ChecklistTemplateWithProperty | null>(null);
  const [filterPropertyId, setFilterPropertyId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [translateName, setTranslateName] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Item form state
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemLabel, setItemLabel] = useState('');
  const [itemType, setItemType] = useState<ChecklistItemType>('checkbox');
  const [itemRequired, setItemRequired] = useState(false);

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['admin-checklists'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('checklist_templates')
        .select(`
          *,
          property:properties (*),
          organizations:organization_id(name)
        `)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as ChecklistTemplateWithProperty[];
    },
  });

  // Fetch properties
  const { data: properties = [] } = useQuery({
    queryKey: ['all-properties'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Property[];
    },
  });

  // Auto-translate checklist item labels
  const translateItems = async (items: ChecklistItem[]): Promise<ChecklistItem[]> => {
    if (items.length === 0) return items;
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ id: i.id, label: i.label })) }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Translation failed');
      }
      const { translations } = await response.json();
      return items.map(item => ({
        ...item,
        translations: translations[item.id] || item.translations || {},
      }));
    } catch (error) {
      console.error('Auto-translation failed:', error);
      const message = error instanceof Error ? error.message : tCheck('translationFailed');
      toast.error(message);
      return items;
    }
  };

  // Translate a checklist name using the same API (sends as a single item)
  const translateNameValue = async (nameStr: string): Promise<Record<string, string>> => {
    try {
      const tempId = 'name';
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: tempId, label: nameStr }] }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Translation failed');
      }
      const { translations } = await response.json();
      return translations[tempId] || {};
    } catch (error) {
      console.error('Name translation failed:', error);
      const message = error instanceof Error ? error.message : tCheck('translationFailed');
      toast.error(message);
      return {};
    }
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; property_id: string; items: ChecklistItem[]; is_active: boolean; image_url: string | null }) => {
      const finalItems = await translateItems(data.items);
      const nameTranslations = translateName ? await translateNameValue(data.name) : {};
      const supabase = getClient();
      const insertData = {
        name: data.name,
        name_translations: nameTranslations,
        property_id: data.property_id,
        items: finalItems,
        is_active: data.is_active,
        image_url: data.image_url,
        organization_id: organizationId,
      };
      const { data: result, error } = await (supabase as any)
        .from('checklist_templates')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return result as ChecklistTemplate;
    },
    onSuccess: () => {
      toast.success(tCheck('created'));
      queryClient.invalidateQueries({ queryKey: ['admin-checklists'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; property_id: string; items: ChecklistItem[]; is_active: boolean; image_url: string | null } }) => {
      const finalItems = await translateItems(data.items);
      const nameTranslations = translateName ? await translateNameValue(data.name) : (editingTemplate?.name_translations || {});
      const supabase = getClient();
      const updateData = {
        name: data.name,
        name_translations: nameTranslations,
        property_id: data.property_id,
        items: finalItems,
        is_active: data.is_active,
        image_url: data.image_url,
      };
      const { data: result, error } = await (supabase as any)
        .from('checklist_templates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result as ChecklistTemplate;
    },
    onSuccess: () => {
      toast.success(tCheck('updated'));
      queryClient.invalidateQueries({ queryKey: ['admin-checklists'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Deactivate mutation (soft-delete)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('checklist_templates')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tCheck('deactivated'));
      queryClient.invalidateQueries({ queryKey: ['admin-checklists'] });
      setShowDeleteDialog(false);
      setDeletingTemplate(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageChecklists) {
      router.push('/admin');
    }
  }, [permissions.canManageChecklists, router]);

  const resetForm = () => {
    setName('');
    setPropertyId('');
    setIsActive(true);
    setImageUrl('');
    setItems([]);
    setEditingTemplate(null);
    setShowForm(false);
    setTranslateName(false);
  };

  const resetItemForm = () => {
    setItemLabel('');
    setItemType('checkbox');
    setItemRequired(false);
    setEditingItemIndex(null);
    setShowItemForm(false);
  };

  const openEditForm = (template: ChecklistTemplateWithProperty) => {
    setName(template.name);
    setPropertyId(template.property_id);
    setIsActive(template.is_active);
    setImageUrl(template.image_url || '');
    setItems((template.items as unknown as ChecklistItem[]) || []);
    setEditingTemplate(template);
    setShowForm(true);
  };

  const openCopyForm = (template: ChecklistTemplateWithProperty) => {
    setName(`${template.name} (${tCheck('copy')})`);
    setPropertyId(template.property_id);
    setIsActive(template.is_active);
    setImageUrl(template.image_url || '');
    // Create new IDs for copied items
    const copiedItems = ((template.items as unknown as ChecklistItem[]) || []).map((item, index) => ({
      ...item,
      id: crypto.randomUUID(),
      order: index,
    }));
    setItems(copiedItems);
    setEditingTemplate(null); // null means create new
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: name.trim(),
      property_id: propertyId,
      items,
      is_active: isActive,
      image_url: imageUrl || null,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddItem = () => {
    if (!itemLabel.trim()) return;

    if (editingItemIndex !== null) {
      // Preserve existing item's id and translations when editing
      const existing = items[editingItemIndex];
      const updatedItem: ChecklistItem = {
        ...existing,
        label: itemLabel.trim(),
        type: itemType,
        required: itemRequired,
      };
      const newItems = [...items];
      newItems[editingItemIndex] = updatedItem;
      setItems(newItems);
    } else {
      const newItem: ChecklistItem = {
        id: crypto.randomUUID(),
        label: itemLabel.trim(),
        type: itemType,
        required: itemRequired,
        order: items.length,
      };
      setItems([...items, newItem]);
    }

    resetItemForm();
  };

  const handleEditItem = (index: number) => {
    const item = items[index];
    setItemLabel(item.label);
    setItemType(item.type);
    setItemRequired(item.required);
    setEditingItemIndex(index);
    setShowItemForm(true);
  };

  const handleDeleteItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;

    const newItems = [...items];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    newItems.forEach((item, i) => (item.order = i));
    setItems(newItems);
  };

  const compressImage = async (file: File): Promise<File> => {
    try {
      const imageCompression = (await import('browser-image-compression')).default;
      return await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
    } catch {
      return file;
    }
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    try {
      const supabase = getClient();
      const file = files[0];
      const isPdf = file.type === 'application/pdf';
      const fileToUpload = isPdf ? file : await compressImage(file);
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || (isPdf ? 'pdf' : 'jpg');
      const filename = `${timestamp}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
      const path = `${organizationId}/checklists/templates/${filename}`;

      const { data, error } = await supabase.storage
        .from('photos')
        .upload(path, fileToUpload, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(data.path);
      setImageUrl(publicUrl);
    } catch (error: any) {
      toast.error(error?.message || tCheck('uploadError'));
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Filter and group templates by property
  const filteredTemplates = filterPropertyId
    ? templates.filter((t) => t.property_id === filterPropertyId)
    : templates;

  const templatesByProperty = filteredTemplates.reduce((acc, template) => {
    const propertyId = template.property_id;
    if (!acc[propertyId]) {
      acc[propertyId] = {
        property: template.property,
        templates: [],
      };
    }
    acc[propertyId].templates.push(template);
    return acc;
  }, {} as Record<string, { property: Property; templates: ChecklistTemplateWithProperty[] }>);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (!permissions.canManageChecklists) {
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title={tCheck('title')}
          rightElement={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(filterPropertyId && 'text-primary-600')}
              >
                <Filter className="h-5 w-5" />
              </Button>
              <Button size="icon" onClick={() => setShowForm(true)}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          }
        />
      }
    >
      {/* Filter Section */}
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <label className="text-sm font-medium block mb-2">{tCheck('property')}</label>
            <select
              value={filterPropertyId}
              onChange={(e) => setFilterPropertyId(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{tCheck('allProperties')}</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Templates list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          {tCheck('loading')}
        </div>
      ) : Object.keys(templatesByProperty).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{tCheck('noChecklists')}</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {tCheck('createFirst')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(templatesByProperty).map(({ property, templates }) => (
            <div key={property.id}>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {property.name}
              </h2>

              <div className="space-y-2">
                {templates.map((template) => {
                  const itemCount = (template.items as unknown as ChecklistItem[])?.length || 0;

                  return (
                    <Card key={template.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          {template.image_url && (
                            <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center">
                              {isPdfUrl(template.image_url) ? (
                                <FileText className="h-6 w-6 text-red-500" />
                              ) : (
                                <img src={template.image_url} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-medium">{template.name}</h3>
                              {!template.is_active && (
                                <span className="badge bg-muted text-muted-foreground text-xs">
                                  {tCheck('inactive')}
                                </span>
                              )}
                              {isSuperAdmin && template.organizations?.name && (
                                <span className="hidden sm:inline-flex badge bg-purple-100 text-purple-700 text-xs">
                                  {template.organizations.name}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {tCheck('itemCount', { count: itemCount })}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openCopyForm(template)}
                              title={tCheck('copy')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditForm(template)}
                              title={tCheck('editAction')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeletingTemplate(template);
                                setShowDeleteDialog(true);
                              }}
                              title={tCheck('deleteAction')}
                            >
                              <Trash2 className="h-4 w-4 text-error-600" />
                            </Button>
                          </div>
                        </div>
                        {isSuperAdmin && template.organizations?.name && (
                          <span className="sm:hidden block w-full rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 mt-2">
                            {template.organizations.name}
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template form sheet */}
      <Sheet open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <SheetContent side="bottom" className="h-[90vh]">
          <SheetHeader>
            <SheetTitle>
              {editingTemplate ? tCheck('editChecklist') : tCheck('newChecklist')}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tCheck('name')} <span className="text-error-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tCheck('namePlaceholder')}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={translateName}
                  onChange={(e) => setTranslateName(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-slate-700">{tCheck('translateName')}</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tCheck('property')} <span className="text-error-500">*</span>
              </label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{tCheck('selectProperty')}</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={cn(
                  'w-10 h-6 rounded-full transition-colors relative',
                  isActive ? 'bg-primary-600' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    isActive ? 'left-5' : 'left-1'
                  )}
                />
              </button>
              <label className="text-sm font-medium">{tCheck('active')}</label>
            </div>

            {/* Image upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tCheck('specSheet')}</label>
              {isUploadingImage ? (
                <div className="w-full h-24 border-2 border-dashed border-primary-300 rounded-lg flex flex-col items-center justify-center gap-2 bg-primary-50">
                  <Loader2 className="h-6 w-6 text-primary-500 animate-spin" />
                  <span className="text-sm text-primary-600">{tCheck('uploading')}</span>
                </div>
              ) : imageUrl ? (
                isPdfUrl(imageUrl) ? (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <FileText className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium flex-1 hover:underline">
                      {tCheck('viewPdf')}
                    </a>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="p-1 text-muted-foreground hover:text-error-600 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={imageUrl} alt={tCheck('specSheet')} className="w-full max-h-[300px] object-contain" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-1 right-1 p-1 bg-error-500 text-white rounded-full shadow-md"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary-500 transition-colors"
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{tCheck('uploadSpecSheet')}</span>
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleImageUpload(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Items section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{tCheck('checklistItems')}</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowItemForm(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {tCheck('addItem')}
                </Button>
              </div>

              {/* Inline item form (replaces Dialog to avoid mobile touch issues) */}
              {showItemForm && (
                <div className="rounded-lg border border-dashed border-primary-300 bg-primary-50/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-primary-700">
                    {editingItemIndex !== null ? tCheck('editItem') : tCheck('newItem')}
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {tCheck('label')} <span className="text-error-500">*</span>
                    </label>
                    <Input
                      value={itemLabel}
                      onChange={(e) => setItemLabel(e.target.value)}
                      placeholder={tCheck('labelPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tCheck('type')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(itemTypeConfig) as ChecklistItemType[]).map((type) => {
                        const config = itemTypeConfig[type];
                        const Icon = config.icon;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setItemType(type)}
                            className={cn(
                              'p-3 rounded-lg border text-left flex items-center gap-2 transition-colors',
                              itemType === type
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-muted hover:border-primary-300'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setItemRequired(!itemRequired)}
                      className={cn(
                        'w-10 h-6 rounded-full transition-colors relative',
                        itemRequired ? 'bg-primary-600' : 'bg-muted'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                          itemRequired ? 'left-5' : 'left-1'
                        )}
                      />
                    </button>
                    <label className="text-sm font-medium">{tCheck('required')}</label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={resetItemForm}>
                      {tCheck('cancel')}
                    </Button>
                    <Button type="button" size="sm" onClick={handleAddItem} disabled={!itemLabel.trim()}>
                      {editingItemIndex !== null ? tCheck('save') : tCheck('add')}
                    </Button>
                  </div>
                </div>
              )}

              {items.length === 0 && !showItemForm ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {tCheck('noItemsYet')}
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, index) => {
                    const TypeIcon = itemTypeConfig[item.type].icon;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 p-3 bg-muted rounded-lg"
                      >
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveItem(index, 'up')}
                            disabled={index === 0}
                            className="p-0.5 hover:bg-background rounded disabled:opacity-30"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(index, 'down')}
                            disabled={index === items.length - 1}
                            className="p-0.5 hover:bg-background rounded disabled:opacity-30"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                        <TypeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {getChecklistItemLabel(item, locale)}
                            {item.required && <span className="text-error-500 ml-1">*</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {itemTypeConfig[item.type].label}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditItem(index)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteItem(index)}
                        >
                          <Trash2 className="h-3 w-3 text-error-600" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={resetForm}
              >
                {tCheck('cancel')}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting || !name.trim() || !propertyId}
              >
                {isSubmitting
                  ? tCheck('saving')
                  : editingTemplate
                  ? tCheck('save')
                  : tCheck('create')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Deactivate confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tCheck('deactivateTitle')}</DialogTitle>
            <DialogDescription>
              {tCheck('deactivateMessage', { name: deletingTemplate?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {tCheck('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingTemplate && deleteMutation.mutate(deletingTemplate.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? tCheck('deactivating') : tCheck('deactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

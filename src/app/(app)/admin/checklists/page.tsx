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
import { usePermissions } from '@/hooks/use-permissions';
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
}

const isPdfUrl = (url: string) => /\.pdf(\?|$)/i.test(url);

const itemTypeConfig: Record<ChecklistItemType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  checkbox: { label: 'Checkbox', icon: Check },
  text: { label: 'Text', icon: Type },
  number: { label: 'Zahl', icon: Hash },
  photo: { label: 'Foto', icon: Camera },
};

export default function AdminChecklistsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplateWithProperty | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<ChecklistTemplateWithProperty | null>(null);
  const [filterPropertyId, setFilterPropertyId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

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
          property:properties (*)
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

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; property_id: string; items: ChecklistItem[]; is_active: boolean; image_url: string | null }) => {
      const supabase = getClient();
      const insertData = {
        name: data.name,
        property_id: data.property_id,
        items: data.items,
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
      toast.success('Checkliste wurde erstellt');
      queryClient.invalidateQueries({ queryKey: ['admin-checklists'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; property_id: string; items: ChecklistItem[]; is_active: boolean; image_url: string | null } }) => {
      const supabase = getClient();
      const updateData = {
        name: data.name,
        property_id: data.property_id,
        items: data.items,
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
      toast.success('Checkliste wurde aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['admin-checklists'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
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
      toast.success('Checkliste wurde deaktiviert');
      queryClient.invalidateQueries({ queryKey: ['admin-checklists'] });
      setShowDeleteDialog(false);
      setDeletingTemplate(null);
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
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
    setName(`${template.name} (Kopie)`);
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

    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      label: itemLabel.trim(),
      type: itemType,
      required: itemRequired,
      order: editingItemIndex !== null ? items[editingItemIndex].order : items.length,
    };

    if (editingItemIndex !== null) {
      const newItems = [...items];
      newItems[editingItemIndex] = newItem;
      setItems(newItems);
    } else {
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
      toast.error(error?.message || 'Datei konnte nicht hochgeladen werden');
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
          title="Checklisten"
          showBack
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
            <label className="text-sm font-medium block mb-2">Liegenschaft</label>
            <select
              value={filterPropertyId}
              onChange={(e) => setFilterPropertyId(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Alle Liegenschaften</option>
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
          Wird geladen...
        </div>
      ) : Object.keys(templatesByProperty).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Checklisten vorhanden</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Erste Checkliste erstellen
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
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{template.name}</h3>
                              {!template.is_active && (
                                <span className="badge bg-muted text-muted-foreground text-xs">
                                  Inaktiv
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {itemCount} {itemCount === 1 ? 'Punkt' : 'Punkte'}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openCopyForm(template)}
                              title="Kopieren"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditForm(template)}
                              title="Bearbeiten"
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
                              title="Löschen"
                            >
                              <Trash2 className="h-4 w-4 text-error-600" />
                            </Button>
                          </div>
                        </div>
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
              {editingTemplate ? 'Checkliste bearbeiten' : 'Neue Checkliste'}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Name <span className="text-error-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Checklistenname"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Liegenschaft <span className="text-error-500">*</span>
              </label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Liegenschaft wählen...</option>
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
              <label className="text-sm font-medium">Aktiv</label>
            </div>

            {/* Image upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pflichtenheft</label>
              {isUploadingImage ? (
                <div className="w-full h-24 border-2 border-dashed border-primary-300 rounded-lg flex flex-col items-center justify-center gap-2 bg-primary-50">
                  <Loader2 className="h-6 w-6 text-primary-500 animate-spin" />
                  <span className="text-sm text-primary-600">Wird hochgeladen...</span>
                </div>
              ) : imageUrl ? (
                isPdfUrl(imageUrl) ? (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <FileText className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium flex-1 hover:underline">
                      PDF anzeigen
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
                  <div className="relative rounded-lg overflow-hidden bg-slate-100 border border-slate-200 inline-block">
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block w-[200px] h-[200px]">
                      <img src={imageUrl} alt="Pflichtenheft" className="w-full h-full object-contain" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-error-500 text-white rounded-full shadow-md"
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
                  <span className="text-sm text-muted-foreground">Pflichtenheft hochladen (Bild/PDF)</span>
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
                <label className="text-sm font-medium">Checklistenpunkte</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowItemForm(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Punkt hinzufügen
                </Button>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Noch keine Punkte hinzugefügt
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
                            {item.label}
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
                Abbrechen
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting || !name.trim() || !propertyId}
              >
                {isSubmitting
                  ? 'Wird gespeichert...'
                  : editingTemplate
                  ? 'Speichern'
                  : 'Erstellen'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Item form dialog */}
      <Dialog open={showItemForm} onOpenChange={(open) => !open && resetItemForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItemIndex !== null ? 'Punkt bearbeiten' : 'Neuer Punkt'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Bezeichnung <span className="text-error-500">*</span>
              </label>
              <Input
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
                placeholder="z.B. Fenster gereinigt"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Typ</label>
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
              <label className="text-sm font-medium">Pflichtfeld</label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetItemForm}>
              Abbrechen
            </Button>
            <Button onClick={handleAddItem} disabled={!itemLabel.trim()}>
              {editingItemIndex !== null ? 'Speichern' : 'Hinzufügen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkliste deaktivieren</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie &quot;{deletingTemplate?.name}&quot; deaktivieren möchten? Die Checkliste und alle bisherigen Einträge bleiben erhalten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingTemplate && deleteMutation.mutate(deletingTemplate.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Wird deaktiviert...' : 'Deaktivieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

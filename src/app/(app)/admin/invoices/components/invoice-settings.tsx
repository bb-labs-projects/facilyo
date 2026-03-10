'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { formatSwissNumber } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { OrganizationBillingSettings, ServiceRate } from '@/types/database';

interface BillingSettingsFormData {
  company_name: string | null;
  company_address: string | null;
  company_postal_code: string | null;
  company_city: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  logo_url: string | null;
  iban: string | null;
  qr_iban: string | null;
  mwst_enabled: boolean;
  mwst_rate: number;
  mwst_number: string | null;
  payment_terms_days: number;
  invoice_number_prefix: string;
  approval_required: boolean;
}

const defaultFormData: BillingSettingsFormData = {
  company_name: null,
  company_address: null,
  company_postal_code: null,
  company_city: null,
  company_phone: null,
  company_email: null,
  company_website: null,
  logo_url: null,
  iban: null,
  qr_iban: null,
  mwst_enabled: false,
  mwst_rate: 8.10,
  mwst_number: null,
  payment_terms_days: 30,
  invoice_number_prefix: 'RE',
  approval_required: false,
};

const ACTIVITY_TYPE_KEYS = ['hauswartung', 'rasen_maehen', 'hecken_schneiden', 'regie', 'reinigung'] as const;

export function InvoiceSettings() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organizationId);
  const tClients = useTranslations('clientsAdmin');
  const tInv = useTranslations('invoicesAdmin');

  // --- Billing settings state ---
  const [formData, setFormData] = useState<BillingSettingsFormData>(defaultFormData);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Service rates state (all rates at once) ---
  const [rateValues, setRateValues] = useState<Record<string, { hourly_rate: string; description: string; editing: boolean }>>({});

  // Session refresh helpers
  const sessionRefreshLock = useRef(false);
  const lastSessionCheck = useRef(0);

  const ensureValidSession = async () => {
    const now = Date.now();
    if (now - lastSessionCheck.current < 5000) return;
    if (sessionRefreshLock.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }
    sessionRefreshLock.current = true;
    try {
      const supabase = getClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw new Error(tInv('settingsMgmt.sessionExpired'));
      }
      lastSessionCheck.current = now;
    } finally {
      sessionRefreshLock.current = false;
    }
  };

  // --- Billing settings queries/mutations ---
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['billing-settings', organizationId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('organization_billing_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) throw error;
      return data as OrganizationBillingSettings | null;
    },
    enabled: !!organizationId,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name,
        company_address: settings.company_address,
        company_postal_code: settings.company_postal_code,
        company_city: settings.company_city,
        company_phone: settings.company_phone,
        company_email: settings.company_email,
        company_website: settings.company_website,
        logo_url: settings.logo_url,
        iban: settings.iban,
        qr_iban: settings.qr_iban,
        mwst_enabled: settings.mwst_enabled,
        mwst_rate: settings.mwst_rate,
        mwst_number: settings.mwst_number,
        payment_terms_days: settings.payment_terms_days,
        invoice_number_prefix: settings.invoice_number_prefix,
        approval_required: settings.approval_required,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: BillingSettingsFormData) => {
      const supabase = getClient();
      await ensureValidSession();

      const { error } = await (supabase as any)
        .from('organization_billing_settings')
        .upsert({
          organization_id: organizationId,
          ...data,
        }, { onConflict: 'organization_id' });

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { error: retryError } = await (supabase as any)
            .from('organization_billing_settings')
            .upsert({
              organization_id: organizationId,
              ...data,
            }, { onConflict: 'organization_id' });
          if (retryError) throw retryError;
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(tInv('settingsMgmt.saved'));
      queryClient.invalidateQueries({ queryKey: ['billing-settings', organizationId] });

      // Regenerate PDFs for all draft invoices (fire and forget)
      fetch('/api/invoices/regenerate-drafts', { method: 'POST' }).catch((err) => {
        console.error('Draft PDF regeneration failed:', err);
      });
    },
    onError: (error: Error) => {
      toast.error(`${tInv('settingsMgmt.error')}: ${error.message}`);
    },
  });

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !organizationId) return;

    setIsUploadingLogo(true);
    try {
      const supabase = getClient();
      const file = files[0];

      const imageCompression = (await import('browser-image-compression')).default;
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });

      const extension = file.name.split('.').pop() || 'jpg';
      const path = `${organizationId}/logos/logo.${extension}`;

      const { data, error } = await supabase.storage
        .from('photos')
        .upload(path, compressedFile, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(data.path);
      setFormData((prev) => ({ ...prev, logo_url: publicUrl }));
      toast.success(tInv('settingsMgmt.logoUploaded'));
    } catch (error: any) {
      toast.error(error?.message || tInv('settingsMgmt.logoUploadFailed'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSaveBilling = () => {
    saveMutation.mutate(formData);
  };

  const updateField = <K extends keyof BillingSettingsFormData>(
    field: K,
    value: BillingSettingsFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // --- Service rates queries/mutations ---
  const { data: serviceRates = [], isLoading: isLoadingRates } = useQuery({
    queryKey: ['service-rates', organizationId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('service_rates')
        .select('*')
        .order('activity_type');

      if (error) throw error;
      return data as ServiceRate[];
    },
    enabled: !!organizationId,
  });

  const ratesByType: Record<string, ServiceRate> = {};
  for (const rate of serviceRates) {
    ratesByType[rate.activity_type] = rate;
  }

  // Initialize rate values from fetched data
  useEffect(() => {
    const values: Record<string, { hourly_rate: string; description: string; editing: boolean }> = {};
    for (const key of ACTIVITY_TYPE_KEYS) {
      const existing = ratesByType[key];
      values[key] = {
        hourly_rate: existing ? String(existing.hourly_rate) : '',
        description: existing?.description ?? '',
        editing: false,
      };
    }
    setRateValues(values);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRates]);

  const updateRateField = (key: string, field: 'hourly_rate' | 'description', value: string) => {
    setRateValues((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const saveAllRatesMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tInv('settingsMgmt.missingData'));
      const supabase = getClient();
      await ensureValidSession();

      const upserts = ACTIVITY_TYPE_KEYS
        .filter((key) => rateValues[key]?.hourly_rate && parseFloat(rateValues[key].hourly_rate) > 0)
        .map((key) => ({
          organization_id: organizationId,
          activity_type: key,
          hourly_rate: parseFloat(rateValues[key].hourly_rate),
          description: rateValues[key].description.trim() || null,
          is_active: true,
        }));

      if (upserts.length === 0) return;

      const { error } = await (supabase as any)
        .from('service_rates')
        .upsert(upserts, { onConflict: 'organization_id,activity_type' });

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { error: retryError } = await (supabase as any)
            .from('service_rates')
            .upsert(upserts, { onConflict: 'organization_id,activity_type' });
          if (retryError) throw retryError;
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(tInv('settingsMgmt.hourlyRatesSaved'));
      queryClient.invalidateQueries({ queryKey: ['service-rates', organizationId] });
    },
    onError: (error: Error) => {
      toast.error(`${tInv('settingsMgmt.error')}: ${error.message}`);
    },
  });

  if (isLoadingSettings || isLoadingRates) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {tInv('settingsMgmt.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Firmendaten */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">{tInv('settingsMgmt.companyData')}</h2>

          <Input
            label={tInv('settingsMgmt.companyName')}
            value={formData.company_name || ''}
            onChange={(e) => updateField('company_name', e.target.value || null)}
            placeholder="Muster GmbH"
          />

          <Input
            label={tInv('settingsMgmt.address')}
            value={formData.company_address || ''}
            onChange={(e) => updateField('company_address', e.target.value || null)}
            placeholder="Musterstrasse 1"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={tInv('settingsMgmt.postalCode')}
              value={formData.company_postal_code || ''}
              onChange={(e) => updateField('company_postal_code', e.target.value || null)}
              placeholder="8000"
            />
            <Input
              label={tInv('settingsMgmt.city')}
              value={formData.company_city || ''}
              onChange={(e) => updateField('company_city', e.target.value || null)}
              placeholder="Zürich"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={tInv('settingsMgmt.phone')}
              value={formData.company_phone || ''}
              onChange={(e) => updateField('company_phone', e.target.value || null)}
              placeholder="+41 44 123 45 67"
            />
            <Input
              label={tInv('settingsMgmt.email')}
              type="email"
              value={formData.company_email || ''}
              onChange={(e) => updateField('company_email', e.target.value || null)}
              placeholder="info@muster.ch"
            />
          </div>

          <Input
            label={tInv('settingsMgmt.website')}
            value={formData.company_website || ''}
            onChange={(e) => updateField('company_website', e.target.value || null)}
            placeholder="www.muster.ch"
          />
        </CardContent>
      </Card>

      {/* Section 2: Logo */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">{tInv('settingsMgmt.logo')}</h2>

          {formData.logo_url && (
            <div className="flex items-center gap-4">
              <img
                src={formData.logo_url}
                alt={tInv('settingsMgmt.companyLogo')}
                className="h-16 w-auto object-contain rounded-lg border border-slate-200"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateField('logo_url', null)}
              >
                {tInv('settingsMgmt.removeLogo')}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs lg:text-sm font-medium text-slate-500">
              {tInv('settingsMgmt.uploadLogo')}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleLogoUpload(e.target.files)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              disabled={isUploadingLogo}
            />
            {isUploadingLogo && (
              <p className="text-sm text-muted-foreground">{tInv('settingsMgmt.uploading')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Bankverbindung */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">{tInv('settingsMgmt.bankDetails')}</h2>

          <Input
            label="IBAN"
            value={formData.iban || ''}
            onChange={(e) => updateField('iban', e.target.value || null)}
            placeholder="CH93 0076 2011 6238 5295 7"
          />

          <Input
            label="QR-IBAN"
            value={formData.qr_iban || ''}
            onChange={(e) => updateField('qr_iban', e.target.value || null)}
            placeholder="CH44 3199 9123 0008 8901 2"
          />
        </CardContent>
      </Card>

      {/* Section 4: MWST */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">{tInv('settingsMgmt.vat')}</h2>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={formData.mwst_enabled}
              onChange={(e) => updateField('mwst_enabled', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-slate-700">{tInv('settingsMgmt.vatLiable')}</span>
          </label>

          {formData.mwst_enabled && (
            <>
              <Input
                label={tInv('settingsMgmt.vatRate')}
                type="number"
                step="0.01"
                value={formData.mwst_rate}
                onChange={(e) => updateField('mwst_rate', parseFloat(e.target.value) || 0)}
              />

              <Input
                label={tInv('settingsMgmt.vatNumber')}
                value={formData.mwst_number || ''}
                onChange={(e) => updateField('mwst_number', e.target.value || null)}
                placeholder="CHE-123.456.789 MWST"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Rechnungsoptionen */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">{tInv('settingsMgmt.invoiceOptions')}</h2>

          <Input
            label={tInv('settingsMgmt.paymentTerms')}
            type="number"
            value={formData.payment_terms_days}
            onChange={(e) => updateField('payment_terms_days', parseInt(e.target.value) || 0)}
          />

          <Input
            label={tInv('settingsMgmt.invoicePrefix')}
            value={formData.invoice_number_prefix}
            onChange={(e) => updateField('invoice_number_prefix', e.target.value || 'RE')}
            placeholder="RE"
          />

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={formData.approval_required}
              onChange={(e) => updateField('approval_required', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-slate-700">{tInv('settingsMgmt.approvalRequired')}</span>
          </label>
        </CardContent>
      </Card>

      {/* Save billing settings button */}
      <Button
        type="button"
        className="w-full"
        onClick={handleSaveBilling}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? tInv('settingsMgmt.saving') : tInv('settingsMgmt.save')}
      </Button>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Section 6: Stundenansätze */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">{tInv('settingsMgmt.hourlyRates')}</h2>

          <div className="space-y-3">
            {ACTIVITY_TYPE_KEYS.map((key) => {
              const rv = rateValues[key];
              const rawVal = rv?.hourly_rate ?? '';
              const numVal = parseFloat(rawVal);
              const displayVal = rv?.editing || !rawVal ? rawVal : (isNaN(numVal) ? rawVal : formatSwissNumber(numVal));
              return (
                <div key={key} className="space-y-1">
                  <label className="text-sm font-medium">{tInv(`activities.${key}`)}</label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="CHF / Std"
                      value={displayVal}
                      onFocus={() => setRateValues((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], editing: true },
                      }))}
                      onBlur={() => setRateValues((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], editing: false },
                      }))}
                      onChange={(e) => updateRateField(key, 'hourly_rate', e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground w-8 flex-shrink-0">/{tClients('perHour')}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            className="w-full"
            onClick={() => saveAllRatesMutation.mutate()}
            disabled={saveAllRatesMutation.isPending}
          >
            {saveAllRatesMutation.isPending ? tInv('settingsMgmt.saving') : tInv('settingsMgmt.saveHourlyRates')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

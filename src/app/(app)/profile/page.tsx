'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  Mail,
  Phone,
  Shield,
  Building2,
  LogOut,
  ChevronRight,
  Bell,
  Info,
  Settings,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { getInitials, cn } from '@/lib/utils';
import type { Property } from '@/types/database';
import { roleLabels } from '@/lib/permissions';

export default function ProfilePage() {
  const router = useRouter();
  const { profile, logout } = useAuthStore();
  const permissions = usePermissions();
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const tp = useTranslations('properties');
  const ta = useTranslations('auth');

  // Fetch assigned properties
  const { data: properties = [] } = useQuery({
    queryKey: ['properties', profile?.id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('property_assignments')
        .select('property:properties(*)')
        .eq('user_id', profile!.id);

      if (error) throw error;
      return (data as { property: Property }[]).map((d) => d.property);
    },
    enabled: !!profile?.id,
  });

  const handleLogout = async () => {
    try {
      await logout();
      toast.success(ta('logoutSuccess'));
      router.push('/login');
    } catch (error) {
      toast.error(ta('logoutError'));
    }
  };

  if (!profile) {
    return (
      <PageContainer header={<Header title={t('title')} />}>
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">{t('profileLoadError')}</p>
          <Button
            variant="outline"
            onClick={async () => {
              const { refreshProfile } = useAuthStore.getState();
              await refreshProfile();
            }}
          >
            {tc('retry')}
          </Button>
          <Button
            variant="ghost"
            className="text-error-600"
            onClick={handleLogout}
          >
            {ta('logout')}
          </Button>
        </div>
      </PageContainer>
    );
  }

  const initials = getInitials(profile.first_name, profile.last_name);
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(' ');

  return (
    <PageContainer header={<Header title={t('title')} />}>
      {/* Profile header */}
      <div className="flex flex-col items-center mb-6">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={fullName}
            width={80}
            height={80}
            className="w-20 h-20 rounded-full object-cover mb-3"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mb-3">
            <span className="text-2xl font-semibold text-primary-700">
              {initials}
            </span>
          </div>
        )}
        <h2 className="text-xl font-semibold">{fullName || tc('noName')}</h2>
        <span className="badge badge-info mt-1">
          {roleLabels[profile.role]}
        </span>
      </div>

      {/* Personal information */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            {t('personalInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">{t('email')}</p>
              <p>{profile.email}</p>
            </div>
          </div>

          {profile.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('phone')}</p>
                <p>{profile.phone}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">{t('role')}</p>
              <p>{roleLabels[profile.role]}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assigned properties */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {tp('title')} ({properties.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tp('noProperties')}
            </p>
          ) : (
            <div className="space-y-2">
              {properties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{property.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {property.address}, {property.city}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin section (for privileged users) */}
      {permissions.canAccessAdminPanel && (
        <Card className="mb-4">
          <CardContent className="p-0">
            <button
              onClick={() => router.push('/admin')}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-primary-600" />
                <span className="font-medium text-primary-600">{t('settings')}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-primary-600" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Language */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('language')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <button disabled className="w-full flex items-center justify-between p-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span>{t('notifications')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="border-t" />

          <button disabled className="w-full flex items-center justify-between p-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-muted-foreground" />
              <span>{t('about')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      {/* Logout button */}
      <Button
        variant="outline"
        size="touch"
        className="w-full border-error-300 text-error-600 hover:bg-error-50"
        onClick={handleLogout}
        leftIcon={<LogOut className="h-5 w-5" />}
      >
        {ta('logout')}
      </Button>

      {/* Version */}
      <p className="text-center text-xs text-muted-foreground mt-6">
        Facilyo v1.0.0
      </p>
    </PageContainer>
  );
}

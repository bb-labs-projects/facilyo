'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Key, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PasswordStrength, PasswordRequirements } from '@/components/auth/password-strength';
import { useAuthStore } from '@/stores/auth-store';
import { changePasswordSchema, type ChangePasswordFormData } from '@/lib/validations';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { username, clearMustChangePassword, logout } = useAuthStore();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const newPassword = watch('newPassword');

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.validationErrors) {
          setValidationErrors(result.validationErrors);
        }
        throw new Error(result.error || 'Fehler beim Ändern des Passworts');
      }

      toast.success('Passwort erfolgreich geändert');
      clearMustChangePassword();
      router.push('/');
    } catch (err: any) {
      setError(err.message);
      toast.error('Passwort konnte nicht geändert werden', {
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      {/* Logo */}
      <div className="flex justify-center mb-8 w-full">
        <Logo size="lg" />
      </div>

      {/* Change Password card */}
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 p-3 rounded-full bg-primary-100 w-fit">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
          </div>
          <CardTitle>Passwort ändern</CardTitle>
          <CardDescription>
            Bitte wählen Sie ein neues sicheres Passwort
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-700">{error}</p>
                {validationErrors.length > 0 && (
                  <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Aktuelles Passwort"
              type={showCurrentPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
              {...register('currentPassword')}
            />

            <div className="space-y-2">
              <Input
                label="Neues Passwort"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
                {...register('newPassword')}
              />
              <PasswordStrength password={newPassword || ''} />
            </div>

            <Input
              label="Neues Passwort bestätigen"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
              {...register('confirmPassword')}
            />

            <PasswordRequirements
              password={newPassword || ''}
              username={username || undefined}
              className="pt-2"
            />

            <Button
              type="submit"
              size="touch"
              className="w-full"
              isLoading={isLoading}
              loadingText="Wird geändert..."
              leftIcon={<Key className="h-5 w-5" />}
            >
              Passwort ändern
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={handleLogout}
            >
              Abmelden
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Version 1.0.0
      </p>
    </>
  );
}

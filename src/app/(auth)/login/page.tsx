'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { loginSchema, type LoginFormData } from '@/lib/validations';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const result = await login(data.username, data.password);
      toast.success('Erfolgreich angemeldet');

      // Redirect to change-password if required
      if (result.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/');
      }
    } catch (error: any) {
      const message = error.message || 'Bitte überprüfen Sie Ihre Eingaben.';
      setLoginError(message);
      toast.error('Anmeldung fehlgeschlagen', {
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Logo */}
      <div className="flex justify-center mb-8 w-full">
        <Logo size="lg" />
      </div>

      {/* Login card */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Anmelden</CardTitle>
          <CardDescription>
            Melden Sie sich mit Ihrem Benutzernamen an
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{loginError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Benutzername"
              type="text"
              placeholder="benutzername"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              error={errors.username?.message}
              {...register('username')}
            />

            <Input
              label="Passwort"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              error={errors.password?.message}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
              {...register('password')}
            />

            <label
              htmlFor="rememberMe"
              className="flex items-center min-h-[44px] cursor-pointer"
            >
              <span className="flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2.5">
                <input
                  type="checkbox"
                  id="rememberMe"
                  className="h-6 w-6 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  {...register('rememberMe')}
                />
              </span>
              <span className="text-sm text-muted-foreground">
                Angemeldet bleiben
              </span>
            </label>

            <Button
              type="submit"
              size="touch"
              className="w-full"
              isLoading={isLoading}
              loadingText="Wird angemeldet..."
              leftIcon={<LogIn className="h-5 w-5" />}
            >
              Anmelden
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Noch kein Konto?{' '}
            <Link href="/register" className="text-primary-600 hover:underline font-medium">
              Jetzt registrieren
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Version 1.0.0
      </p>
    </>
  );
}

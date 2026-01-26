'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { loginSchema, type LoginFormData } from '@/lib/validations';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      toast.success('Erfolgreich angemeldet');
      router.push('/');
    } catch (error) {
      toast.error('Anmeldung fehlgeschlagen', {
        description: 'Bitte überprüfen Sie Ihre Eingaben.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <Image
          src="/logo.png"
          alt="Flückiger Hauswartung"
          width={200}
          height={60}
          className="h-16 w-auto object-contain mb-4"
          priority
        />
        <p className="text-sm text-muted-foreground">Zeit- & Problemerfassung</p>
      </div>

      {/* Login card */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Anmelden</CardTitle>
          <CardDescription>
            Melden Sie sich mit Ihrer E-Mail und Passwort an
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="E-Mail"
              type="email"
              inputMode="email"
              placeholder="name@firma.ch"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
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
            <Link href="/signup" className="text-primary-600 hover:underline">
              Registrieren
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

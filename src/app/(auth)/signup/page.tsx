'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';

const signupSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen haben'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwörter stimmen nicht überein',
  path: ['confirmPassword'],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((state) => state.signup);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      await signup(data.email, data.password);
      toast.success('Konto erfolgreich erstellt', {
        description: 'Sie können sich jetzt anmelden.',
      });
      router.push('/');
    } catch (error: any) {
      toast.error('Registrierung fehlgeschlagen', {
        description: error.message || 'Bitte versuchen Sie es erneut.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Logo */}
      <div className="flex justify-center mb-8 w-full">
        <Image
          src="/logo.png"
          alt="Flückiger Hauswartung"
          width={400}
          height={120}
          className="w-full max-w-sm object-contain"
          priority
        />
      </div>

      {/* Signup card */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Registrieren</CardTitle>
          <CardDescription>
            Erstellen Sie ein neues Konto
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="E-Mail"
              type="email"
              placeholder="name@firma.ch"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Passwort"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
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

            <Input
              label="Passwort bestätigen"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              size="touch"
              className="w-full"
              isLoading={isLoading}
              loadingText="Wird erstellt..."
              leftIcon={<UserPlus className="h-5 w-5" />}
            >
              Registrieren
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Bereits ein Konto?{' '}
            <Link href="/login" className="text-primary-600 hover:underline">
              Anmelden
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

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateSlug } from '@/lib/auth/slug';

const registerSchema = z.object({
  companyName: z.string().min(2, 'Mindestens 2 Zeichen erforderlich'),
  slug: z
    .string()
    .min(3, 'Mindestens 3 Zeichen erforderlich')
    .regex(/^[a-z0-9-]+$/, 'Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt'),
  firstName: z.string().min(1, 'Dieses Feld ist erforderlich'),
  lastName: z.string().min(1, 'Dieses Feld ist erforderlich'),
  username: z
    .string()
    .min(3, 'Mindestens 3 Zeichen erforderlich')
    .regex(/^[a-z0-9._-]+$/, 'Nur Kleinbuchstaben, Zahlen, Punkte und Bindestriche erlaubt'),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z
    .string()
    .min(12, 'Mindestens 12 Zeichen erforderlich')
    .refine((val) => /[A-Z]/.test(val), 'Muss mindestens einen Grossbuchstaben enthalten')
    .refine((val) => /[a-z]/.test(val), 'Muss mindestens einen Kleinbuchstaben enthalten')
    .refine((val) => /[0-9]/.test(val), 'Muss mindestens eine Zahl enthalten'),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      companyName: '',
      slug: '',
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      password: '',
    },
  });

  const companyName = watch('companyName');

  const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setValue('companyName', name);
    // Auto-generate slug from company name
    if (name) {
      setValue('slug', generateSlug(name), { shouldValidate: true });
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setRegisterError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          username: data.username.toLowerCase(),
          email: data.email.toLowerCase(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setRegisterError(result.error || 'Registrierung fehlgeschlagen');
        return;
      }

      toast.success('Registrierung erfolgreich! Sie können sich jetzt anmelden.');
      router.push('/login');
    } catch {
      setRegisterError('Ein unerwarteter Fehler ist aufgetreten');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Building2 className="h-6 w-6" />
            Firma registrieren
          </CardTitle>
          <CardDescription>
            Erstellen Sie ein neues Firmenkonto
          </CardDescription>
        </CardHeader>

        <CardContent>
          {registerError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{registerError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-3 pb-3 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Firma</p>
              <Input
                label="Firmenname"
                type="text"
                placeholder="Muster Facility GmbH"
                error={errors.companyName?.message}
                {...register('companyName')}
                onChange={handleCompanyNameChange}
              />

              <Input
                label="Firmenkennung (URL-Slug)"
                type="text"
                placeholder="muster-hauswartung"
                error={errors.slug?.message}
                {...register('slug')}
              />
            </div>

            <div className="space-y-3 pb-3 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Administrator</p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Vorname"
                  type="text"
                  placeholder="Max"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Nachname"
                  type="text"
                  placeholder="Muster"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                label="Benutzername"
                type="text"
                placeholder="max.muster"
                autoCapitalize="none"
                autoCorrect="off"
                error={errors.username?.message}
                {...register('username')}
              />

              <Input
                label="E-Mail"
                type="email"
                placeholder="max@muster-hauswartung.ch"
                autoCapitalize="none"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Passwort"
                type={showPassword ? 'text' : 'password'}
                placeholder="Mindestens 12 Zeichen"
                autoComplete="new-password"
                error={errors.password?.message}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                {...register('password')}
              />
            </div>

            <Button
              type="submit"
              size="touch"
              className="w-full"
              isLoading={isLoading}
              loadingText="Wird registriert..."
            >
              Registrieren
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Bereits ein Konto?{' '}
            <Link href="/login" className="text-primary-600 hover:underline font-medium">
              Jetzt anmelden
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}

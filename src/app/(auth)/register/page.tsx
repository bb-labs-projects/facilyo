'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateSlug } from '@/lib/auth/slug';

// NOTE: Zod schemas are defined outside of the component and cannot use hooks.
// We use a function to create the schema so we can pass translated messages.
function createRegisterSchema(t: (key: string) => string) {
  return z.object({
    companyName: z.string().min(2, t('validationMin2')),
    slug: z
      .string()
      .min(3, t('validationMin3'))
      .regex(/^[a-z0-9-]+$/, t('validationSlugFormat')),
    firstName: z.string().min(1, t('validationRequired')),
    lastName: z.string().min(1, t('validationRequired')),
    username: z
      .string()
      .min(3, t('validationMin3'))
      .regex(/^[a-z0-9._-]+$/, t('validationUsernameFormat')),
    email: z.string().email(t('validationEmail')),
    password: z
      .string()
      .min(12, t('validationMin12'))
      .refine((val) => /[A-Z]/.test(val), t('validationUppercase'))
      .refine((val) => /[a-z]/.test(val), t('validationLowercase'))
      .refine((val) => /[0-9]/.test(val), t('validationNumber')),
  });
}

type RegisterFormData = z.infer<ReturnType<typeof createRegisterSchema>>;

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const registerSchema = createRegisterSchema(t);

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
        setRegisterError(result.error || t('registrationFailed'));
        return;
      }

      toast.success(t('registrationSuccess'));
      router.push('/login');
    } catch {
      setRegisterError(t('registrationFailed'));
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
            {t('registerTitle')}
          </CardTitle>
          <CardDescription>
            {t('registerDescription')}
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('company')}</p>
              <Input
                label={t('companyName')}
                type="text"
                placeholder={t('companyNamePlaceholder')}
                error={errors.companyName?.message}
                {...register('companyName')}
                onChange={handleCompanyNameChange}
              />

              <Input
                label={t('companySlug')}
                type="text"
                placeholder={t('companySlugPlaceholder')}
                error={errors.slug?.message}
                {...register('slug')}
              />
            </div>

            <div className="space-y-3 pb-3 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('administrator')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('firstName')}
                  type="text"
                  placeholder={t('firstNamePlaceholder')}
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label={t('lastName')}
                  type="text"
                  placeholder={t('lastNamePlaceholder')}
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                label={t('username')}
                type="text"
                placeholder={t('usernamePlaceholder')}
                autoCapitalize="none"
                autoCorrect="off"
                error={errors.username?.message}
                {...register('username')}
              />

              <Input
                label={t('email')}
                type="email"
                placeholder={t('emailPlaceholder')}
                autoCapitalize="none"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder={t('passwordPlaceholder')}
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
              loadingText={t('registering')}
            >
              {t('register')}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('alreadyHaveAccount')}{' '}
            <Link href="/login" className="text-primary-600 hover:underline font-medium">
              {t('loginNow')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}

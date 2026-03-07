'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getPasswordStrength } from '@/lib/auth/validation';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  const t = useTranslations('auth');
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (!password) {
    return null;
  }

  const colorClasses: Record<string, string> = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-500',
    lime: 'bg-lime-500',
    green: 'bg-green-500',
    gray: 'bg-gray-300',
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Strength bar */}
      <div
        className="flex gap-1"
        role="meter"
        aria-valuenow={strength.score}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-label={t('passwordStrengthLabel')}
      >
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              level <= strength.score
                ? colorClasses[strength.color]
                : 'bg-gray-200'
            )}
          />
        ))}
      </div>

      {/* Strength label */}
      <p
        className={cn(
          'text-sm font-medium',
          strength.score <= 1 && 'text-red-600',
          strength.score === 2 && 'text-yellow-600',
          strength.score >= 3 && 'text-green-600'
        )}
      >
        {strength.label}
      </p>
    </div>
  );
}

interface PasswordRequirementsProps {
  password: string;
  username?: string;
  className?: string;
}

export function PasswordRequirements({
  password,
  username,
  className,
}: PasswordRequirementsProps) {
  const t = useTranslations('auth');

  const requirements = useMemo(() => {
    const checks = [
      {
        label: t('passwordRequirements.minLength'),
        met: password.length >= 12,
      },
      {
        label: t('passwordRequirements.uppercase'),
        met: /[A-Z]/.test(password),
      },
      {
        label: t('passwordRequirements.lowercase'),
        met: /[a-z]/.test(password),
      },
      {
        label: t('passwordRequirements.number'),
        met: /[0-9]/.test(password),
      },
      {
        label: t('passwordRequirements.specialChar'),
        met: /[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'`~]/.test(password),
      },
    ];

    // Add check for username similarity if username is provided
    if (username) {
      checks.push({
        label: t('passwordRequirements.differentFromUsername'),
        met: !password.toLowerCase().includes(username.toLowerCase()),
      });
    }

    return checks;
  }, [password, username, t]);

  if (!password) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium text-muted-foreground">{t('passwordRequirements.title')}</p>
      <ul className="space-y-1">
        {requirements.map((req, index) => (
          <li
            key={index}
            className={cn(
              'flex items-center gap-2 text-sm',
              req.met ? 'text-green-600' : 'text-muted-foreground'
            )}
          >
            {req.met ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            {req.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

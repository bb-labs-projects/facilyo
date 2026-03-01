import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'lg';
  variant?: 'light' | 'dark';
  className?: string;
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      <rect width="48" height="48" rx="12" fill="#0D1424" fillOpacity="0.9" />
      <rect x="13" y="10" width="5" height="28" rx="2.5" fill="white" />
      <rect x="13" y="10" width="22" height="5" rx="2.5" fill="white" />
      <rect x="13" y="21.5" width="14" height="5" rx="2.5" fill="white" />
      <circle cx="32.5" cy="24" r="3.5" fill="#00DC82" />
    </svg>
  );
}

export function Logo({ size = 'sm', variant = 'dark', className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoIcon
        className={cn(
          size === 'sm' ? 'w-9 h-9' : 'w-12 h-12'
        )}
      />
      <span
        className={cn(
          'font-bold tracking-tight',
          variant === 'light' ? 'text-white' : 'text-gray-900',
          size === 'sm' ? 'text-xl' : 'text-2xl'
        )}
      >
        Facilyo
      </span>
    </div>
  );
}

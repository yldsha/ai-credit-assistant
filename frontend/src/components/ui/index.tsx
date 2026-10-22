import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = ({ className, variant = 'primary', size = 'md', ...props }: any) => {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-bold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
        variant === 'primary' && 'bg-alfa text-white hover:bg-alfaDark focus:ring-alfa shadow-lg shadow-red-500/20',
        variant === 'secondary' && 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-400',
        variant === 'outline' && 'border border-slate-200 text-slate-700 hover:bg-slate-50',
        variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 shadow-lg shadow-red-500/20',
        variant === 'success' && 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-500 shadow-lg shadow-green-500/20',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        className
      )}
      {...props}
    />
  );
};

export const Card = ({ className, ...props }: any) => (
  <div className={cn('bg-white rounded-3xl shadow-sm border border-slate-100', className)} {...props} />
);

export const Badge = ({ className, variant = 'info', ...props }: any) => (
  <span
    className={cn(
      'px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap',
      variant === 'success' && 'bg-green-100 text-green-700',
      variant === 'warning' && 'bg-yellow-100 text-yellow-700',
      variant === 'danger' && 'bg-red-100 text-red-700',
      variant === 'info' && 'bg-blue-100 text-blue-700',
      variant === 'default' && 'bg-slate-100 text-slate-700',
      className
    )}
    {...props}
  />
);
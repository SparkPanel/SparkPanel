import clsx from 'clsx';
import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export const Button: React.FC<Props> = ({ variant = 'secondary', loading, className, children, ...rest }) => {
  const base = 'inline-flex items-center justify-center rounded px-3 py-1.5 text-sm transition disabled:opacity-60 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    secondary: 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button className={clsx(base, variants[variant], className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="mr-2 inline-block h-4 w-4 animate-spin border-2 border-white/80 border-t-transparent rounded-full" />}
      {children}
    </button>
  );
};

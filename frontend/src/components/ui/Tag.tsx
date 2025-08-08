import React from 'react';
import clsx from 'clsx';

export const Tag: React.FC<{ color?: 'green' | 'yellow' | 'gray' | 'red'; children: React.ReactNode }> = ({ color = 'gray', children }) => {
  const map: Record<string, string> = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  };
  return <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs', map[color])}>{children}</span>;
};

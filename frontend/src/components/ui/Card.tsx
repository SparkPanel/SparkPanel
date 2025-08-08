import React from 'react';
import clsx from 'clsx';

export const Card: React.FC<React.PropsWithChildren<{ className?: string; title?: string; actions?: React.ReactNode }>> = ({ className, title, actions, children }) => {
  return (
    <div className={clsx('rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="font-semibold">{title}</div>
          <div>{actions}</div>
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
};

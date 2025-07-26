import React from 'react';
import { Navigate, Route, RouteProps } from 'react-router-dom';
import { useStoreState } from '@/state/hooks';

export default ({ children, ...props }: Omit<RouteProps, 'render'>) => {
    const isAuthenticated = useStoreState((state) => !!state.user.data?.uuid);

    return (
        <Route
            {...props}
            element={isAuthenticated ? children : <Navigate to="/auth/login" replace />}
        />
    );
};
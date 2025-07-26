import React, { lazy } from 'react';
import { hot } from 'react-hot-loader/root';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import { StoreProvider } from 'easy-peasy';
import { store } from '@/state';
import { SiteSettings } from '@/state/settings';
import ProgressBar from '@/components/elements/ProgressBar';
import { NotFound } from '@/components/elements/ScreenBlock';
import tw from 'twin.macro';
import GlobalStylesheet from '@/assets/css/GlobalStylesheet';
import { history } from '@/components/history';
import { setupInterceptors } from '@/api/interceptors';
import AuthenticatedRoute from '@/components/elements/AuthenticatedRoute';
import { ServerContext } from '@/state/server';
import '@/assets/tailwind.css';
import Spinner from '@/components/elements/Spinner';

const DashboardRouter = lazy(() => import(/* webpackChunkName: "dashboard" */ '@/routers/DashboardRouter'));
const ServerRouter = lazy(() => import(/* webpackChunkName: "server" */ '@/routers/ServerRouter'));
const AuthenticationRouter = lazy(() => import(/* webpackChunkName: "auth" */ '@/routers/AuthenticationRouter'));

interface ExtendedWindow extends Window {
    SiteConfiguration?: SiteSettings;
    SparkPanelUser?: {
        uuid: string;
        username: string;
        email: string;
        /* eslint-disable camelcase */
        root_admin: boolean;
        use_totp: boolean;
        language: string;
        updated_at: string;
        created_at: string;
        /* eslint-enable camelcase */
    };
}

setupInterceptors(history);

const App = () => {
    const { SparkPanelUser, SiteConfiguration } = window as ExtendedWindow;
    if (SparkPanelUser && !store.getState().user.data) {
        store.getActions().user.setUserData({
            uuid: SparkPanelUser.uuid,
            username: SparkPanelUser.username,
            email: SparkPanelUser.email,
            language: SparkPanelUser.language,
            rootAdmin: SparkPanelUser.root_admin,
            useTotp: SparkPanelUser.use_totp,
            createdAt: new Date(SparkPanelUser.created_at),
            updatedAt: new Date(SparkPanelUser.updated_at),
        });
    }

    if (!store.getState().settings.data) {
        store.getActions().settings.setSettings(SiteConfiguration!);
    }

    return (
        <>
            <GlobalStylesheet />
            <StoreProvider store={store}>
                <ProgressBar />
                <div css={tw`mx-auto w-auto`}>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/auth/*" element={
                                <Spinner.Suspense>
                                    <AuthenticationRouter />
                                </Spinner.Suspense>
                            } />
                            <Route path="/server/:id/*" element={
                                <Spinner.Suspense>
                                    <ServerContext.Provider>
                                        <ServerRouter />
                                    </ServerContext.Provider>
                                </Spinner.Suspense>
                            } />
                            <Route path="/*" element={
                                <Spinner.Suspense>
                                    <DashboardRouter />
                                </Spinner.Suspense>
                            } />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </BrowserRouter>
                </div>
            </StoreProvider>
        </>
    );
};

export default hot(App);
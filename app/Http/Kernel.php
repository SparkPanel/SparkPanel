<?php

namespace SparkPanel\Http;

use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Http\Middleware\TrustProxies;
use SparkPanel\Http\Middleware\TrimStrings;
use Illuminate\Session\Middleware\StartSession;
use SparkPanel\Http\Middleware\EncryptCookies;
use SparkPanel\Http\Middleware\Api\IsValidJson;
use SparkPanel\Http\Middleware\VerifyCsrfToken;
use SparkPanel\Http\Middleware\VerifyReCaptcha;
use Illuminate\Routing\Middleware\ThrottleRequests;
use SparkPanel\Http\Middleware\LanguageMiddleware;
use Illuminate\Foundation\Http\Kernel as HttpKernel;
use Illuminate\Routing\Middleware\SubstituteBindings;
use SparkPanel\Http\Middleware\Activity\TrackAPIKey;
use Illuminate\Session\Middleware\AuthenticateSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use SparkPanel\Http\Middleware\MaintenanceMiddleware;
use SparkPanel\Http\Middleware\EnsureStatefulRequests;
use SparkPanel\Http\Middleware\RedirectIfAuthenticated;
use Illuminate\Auth\Middleware\AuthenticateWithBasicAuth;
use SparkPanel\Http\Middleware\Api\AuthenticateIPAccess;
use Illuminate\Foundation\Http\Middleware\ValidatePostSize;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use SparkPanel\Http\Middleware\Api\Daemon\DaemonAuthenticate;
use SparkPanel\Http\Middleware\Api\Client\RequireClientApiKey;
use SparkPanel\Http\Middleware\RequireTwoFactorAuthentication;
use Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull;
use SparkPanel\Http\Middleware\Api\Client\SubstituteClientBindings;
use Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance;
use SparkPanel\Http\Middleware\Api\Application\AuthenticateApplicationUser;

class Kernel extends HttpKernel
{
    /**
     * The application's global HTTP middleware stack.
     */
    protected $middleware = [
        TrustProxies::class,
        HandleCors::class,
        PreventRequestsDuringMaintenance::class,
        ValidatePostSize::class,
        TrimStrings::class,
        ConvertEmptyStringsToNull::class,
        
        // Add maintenance middleware early in the stack
        MaintenanceMiddleware::class,
    ];

    /**
     * The application's route middleware groups.
     */
    protected $middlewareGroups = [
        'web' => [
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            ShareErrorsFromSession::class,
            VerifyCsrfToken::class,
            SubstituteBindings::class,
            LanguageMiddleware::class,
        ],

        'api' => [
            EnsureStatefulRequests::class,
            ThrottleRequests::class . ':api',
            SubstituteBindings::class,
        ],
    ];

    /**
     * The application's route middleware.
     */
    protected $routeMiddleware = [
        'auth' => Authenticate::class,
        'auth.basic' => AuthenticateWithBasicAuth::class,
        'auth.session' => AuthenticateSession::class,
        'cache.headers' => \Illuminate\Http\Middleware\SetCacheHeaders::class,
        'can' => Authorize::class,
        'guest' => RedirectIfAuthenticated::class,
        'password.confirm' => \Illuminate\Auth\Middleware\RequirePassword::class,
        'signed' => \Illuminate\Routing\Middleware\ValidateSignature::class,
        'throttle' => ThrottleRequests::class,
        'verified' => \Illuminate\Auth\Middleware\EnsureEmailIsVerified::class,
        
        // Custom middleware
        'admin' => AdminAuthenticate::class,
        'two-factor' => RequireTwoFactorAuthentication::class,
        'client-api' => RequireClientApiKey::class,
        'daemon' => DaemonAuthenticate::class,
        'api-key' => AuthenticateApplicationUser::class,
        'track-api' => TrackAPIKey::class,
        'substitute-client' => SubstituteClientBindings::class,
        'is-json' => IsValidJson::class,
        'ip-access' => AuthenticateIPAccess::class,
    ];
}

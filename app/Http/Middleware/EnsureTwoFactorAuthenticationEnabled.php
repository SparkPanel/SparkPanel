<?php

namespace SparkPanel\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpKernel\Exception\HttpException;

class EnsureTwoFactorAuthenticationEnabled
{
    /**
     * Handle an incoming request.
     */
    public function handle($request, Closure $next)
    {
        // Проверяем, что пользователь аутентифицирован
        if (Auth::check()) {
            // Проверяем, включена ли двухфакторная аутентификация
            if (!config('auth.two_factor.enabled')) {
                return response()->json([
                    'error' => 'Two-factor authentication is not enabled',
                    'code' => 'two_factor_not_enabled'
                ], 403);
            }
        }

        return $next($request);
    }
}
<?php

namespace SparkPanel\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpKernel\Exception\HttpException;

class RequireTwoFactorAuthentication
{
    /**
     * Handle an incoming request.
     */
    public function handle($request, Closure $next)
    {
        // No 2FA required anymore
        return $next($request);
    }
}

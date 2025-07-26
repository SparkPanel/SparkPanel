<?php

namespace SparkPanel\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpKernel\Exception\HttpException;

class RequireTelegramBotToken
{
    /**
     * Handle an incoming request.
     */
    public function handle($request, Closure $next)
    {
        // Проверяем, что пользователь аутентифицирован
        if (Auth::check()) {
            // Проверяем, что Telegram бот токен настроен в .env
            if (!config('auth.telegram.bot_token')) {
                return response()->json([
                    'error' => 'Telegram bot token not configured',
                    'code' => 'telegram_token_not_configured'
                ], 503);
            }
        }

        return $next($request);
    }
}
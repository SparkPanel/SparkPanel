<?php

namespace SparkPanel\Http\Controllers\Api\Client;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use SparkPanel\Models\User;
use SparkPanel\Rules\Telegram\ValidTelegramChatId;
use SparkPanel\Rules\Telegram\ValidTelegramToken;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use SparkPanel\Http\Controllers\ApiController;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Session;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

class TelegramTwoFactorController extends ApiController
{
    /**
     * Отправляет запрос на подтверждение двухфакторной аутентификации через Telegram.
     */
    public function sendVerification(Request $request)
    {
        $user = Auth::user();

        // Проверяем, что пользователь имеет telegram_token
        if (!$user->telegram_token) {
            return response()->json(['error' => 'Telegram token not configured'], 400);
        }

        // Валидируем telegram_token как chat_id
        $validator = Validator::make(['chat_id' => $user->telegram_token], [
            'chat_id' => ['required', new ValidTelegramChatId()],
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => 'Invalid Telegram chat ID', 'errors' => $validator->errors()], 422);
        }

        try {
            $client = new Client([
                'base_uri' => "https://api.telegram.org/bot{$user->telegram_token}/",
            ]);

            $response = $client->post('sendMessage', [
                'json' => [
                    'chat_id' => $user->telegram_token,
                    'text' => 'Подтвердите вход в панель управления.',
                    'reply_markup' => [
                        'inline_keyboard' => [[
                            [
                                'text' => 'Подтвердить',
                                'url' => url("/auth/2fa/confirm?token={$user->remember_token}")
                            ]
                        ]]
                    ]
                ]
            ]);

            if ($response->getStatusCode() !== 200) {
                Log::error('Failed to send Telegram verification message', [
                    'status_code' => $response->getStatusCode(),
                    'user_id' => $user->id
                ]);
                return response()->json(['error' => 'Failed to send Telegram verification message'], 503);
            }

            return response()->json(['success' => true]);
        } catch (GuzzleException $e) {
            Log::error('Telegram API error: ' . $e->getMessage(), [
                'exception' => $e,
                'user_id' => $user->id
            ]);
            return response()->json(['error' => 'Telegram API error'], 503);
        }
    }

    /**
     * Повторно отправляет токен через Telegram.
     */
    public function resendVerification(Request $request)
    {
        // Проверяем, что пользователь аутентифицирован
        if (!Auth::check()) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Проверяем, не было ли слишком много попыток
        $maxAttempts = config('auth.two_factor.max_verification_attempts', 5);
        $attempts = Session::get('telegram_resend_attempts', 0);
        
        if ($attempts >= $maxAttempts) {
            throw new TooManyRequestsHttpException(
                config('auth.two_factor.verification_attempt_delay', 10),
                'Too many resend attempts'
            );
        }

        $token = $request->input('token');

        if (!$token) {
            return response()->json(['error' => 'Token not provided'], 400);
        }

        $user = User::where('remember_token', $token)->first();

        if (!$user) {
            return response()->json(['error' => 'Invalid token'], 401);
        }

        try {
            // Генерируем новый токен
            $newToken = $user->generateTwoFactorToken();
            
            // Увеличиваем счетчик попыток
            Session::put('telegram_resend_attempts', $attempts + 1);
            
            // Отправляем новое сообщение через Telegram
            $client = new Client([
                'base_uri' => "https://api.telegram.org/bot{$user->telegram_token}/",
            ]);

            $response = $client->post('sendMessage', [
                'json' => [
                    'chat_id' => $user->telegram_token,
                    'text' => 'Подтвердите вход в панель управления.',
                    'reply_markup' => [
                        'inline_keyboard' => [[
                            [
                                'text' => 'Подтвердить',
                                'url' => url("/auth/2fa/confirm?token={$newToken}")
                            ]
                        ]]
                    ]
                ]
            ]);

            if ($response->getStatusCode() !== 200) {
                Log::error('Failed to resend Telegram verification message', [
                    'status_code' => $response->getStatusCode(),
                    'user_id' => $user->id
                ]);
                return response()->json(['error' => 'Failed to send Telegram message'], 503);
            }

            return response()->json(['success' => true, 'new_token' => $newToken]);
        } catch (GuzzleException $e) {
            Log::error('Telegram API error while resending token: ' . $e->getMessage(), [
                'exception' => $e,
                'user_id' => $user->id
            ]);
            return response()->json(['error' => 'Telegram API error'], 503);
        }
    }

    /**
     * Подтверждает вход через Telegram.
     */
    public function confirmVerification(Request $request)
    {
        $token = $request->query('token');
        
        // Проверяем, что токен указан
        if (!$token) {
            return response()->json(['error' => 'Token not provided'], 400);
        }
        
        // Находим пользователя по токену
        $user = User::where('remember_token', $token)->first();
        
        // Проверяем, что пользователь найден
        if (!$user) {
            return response()->json(['error' => 'Invalid token'], 401);
        }
        
        // Проверяем, что токен еще не истек
        if ($user->twoFactorTokenExpired()) {
            return response()->json(['error' => 'Token expired'], 401);
        }
        
        // Ограничиваем количество попыток подтверждения
        $maxAttempts = config('auth.two_factor.max_verification_attempts', 5);
        $attempts = session('telegram_verification_attempts', 0);
        
        if ($attempts >= $maxAttempts) {
            return response()->json(['error' => 'Max verification attempts exceeded'], 429);
        }
        
        // Увеличиваем счетчик попыток
        session(['telegram_verification_attempts' => $attempts + 1]);
        
        // Очищаем токен после использования
        $user->clearTwoFactorToken();
        
        // Аутентифицируем пользователя
        Auth::login($user);
        
        return response()->json(['success' => true]);
    }

    /**
     * Проверяет статус токена на сервере.
     */
    public function checkToken(Request $request)
    {
        $token = $request->query('token');

        if (!$token) {
            return response()->json(['error' => 'Token not provided'], 400);
        }

        $user = User::where('remember_token', $token)->first();

        if (!$user) {
            return response()->json(['error' => 'Invalid token'], 401);
        }

        if ($user->twoFactorTokenExpired()) {
            return response()->json(['error' => 'Token expired'], 401);
        }

        return response()->json(['expired' => false]);
    }


}
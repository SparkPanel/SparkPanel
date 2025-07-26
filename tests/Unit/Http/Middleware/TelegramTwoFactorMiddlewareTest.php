<?php

namespace Tests\Unit\Http\Middleware;

use SparkPanel\Http\Middleware\RequireTelegramBotToken;
use SparkPanel\Http\Middleware\EnsureTwoFactorAuthenticationEnabled;
use SparkPanel\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TelegramTwoFactorMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    /** @test */
    public function require_telegram_bot_token_middleware_blocks_when_token_not_configured()
    {
        // Создаем пользователя и логинимся
        $user = User::factory()->create();
        $this->actingAs($user);

        // Устанавливаем TELEGRAM_BOT_TOKEN в null
        config(['auth.telegram.bot_token' => null]);

        // Отправляем запрос через middleware
        $response = $this->withMiddleware([
            RequireTelegramBotToken::class
        ])->postJson('/api/client/account/telegram-2fa/send-verification');

        // Проверяем ответ
        $response->assertStatus(503);
        $response->assertJsonStructure(['error', 'code']);
        $this->assertEquals('telegram_token_not_configured', $response->json('code'));
    }

    /** @test */
    public function require_telegram_bot_token_middleware_allows_when_token_configured()
    {
        // Создаем пользователя и логинимся
        $user = User::factory()->create([
            'telegram_token' => '123456789'
        ]);
        $this->actingAs($user);

        // Устанавливаем TELEGRAM_BOT_TOKEN
        config(['auth.telegram.bot_token' => '123456789:ABCdefGHIJKLmnopqRTUVwXYz']);

        // Отправляем запрос через middleware
        $response = $this->withMiddleware([
            RequireTelegramBotToken::class
        ])->postJson('/api/client/account/telegram-2fa/send-verification');

        // Проверяем, что запрос прошел
        $response->assertStatus(200);
    }

    /** @test */
    public function ensure_two_factor_authentication_enabled_blocks_when_disabled()
    {
        // Создаем пользователя и логинимся
        $user = User::factory()->create([
            'telegram_token' => '123456789'
        ]);
        $this->actingAs($user);

        // Отключаем двухфакторную аутентификацию
        config(['auth.two_factor.enabled' => false]);

        // Отправляем запрос через middleware
        $response = $this->withMiddleware([
            EnsureTwoFactorAuthenticationEnabled::class
        ])->postJson('/api/client/account/telegram-2fa/send-verification');

        // Проверяем ответ
        $response->assertStatus(403);
        $response->assertJsonStructure(['error', 'code']);
        $this->assertEquals('two_factor_not_enabled', $response->json('code'));
    }

    /** @test */
    public function ensure_two_factor_authentication_enabled_allows_when_enabled()
    {
        // Создаем пользователя и логинимся
        $user = User::factory()->create([
            'telegram_token' => '123456789'
        ]);
        $this->actingAs($user);

        // Включаем двухфакторную аутентификацию
        config(['auth.two_factor.enabled' => true]);
        config(['auth.telegram.bot_token' => '123456789:ABCdefGHIJKLmnopqRTUVwXYz']);

        // Отправляем запрос через middleware
        $response = $this->withMiddleware([
            EnsureTwoFactorAuthenticationEnabled::class,
            RequireTelegramBotToken::class
        ])->postJson('/api/client/account/telegram-2fa/send-verification');

        // Проверяем, что запрос прошел
        $response->assertStatus(200);
    }
}
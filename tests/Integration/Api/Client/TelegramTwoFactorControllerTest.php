<?php

namespace Tests\Integration\Api\Client;

use SparkPanel\Models\User;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class TelegramTwoFactorControllerTest extends TestCase
{
    /** @test */
    public function it_sends_verification_request_to_telegram()
    {
        $user = User::factory()->create([
            'telegram_token' => '123456789',
        ]);

        Auth::login($user);

        $response = $this->postJson('/api/client/account/telegram-2fa/send-verification');

        $response->assertOk();
    }

    /** @test */
    public function it_confirms_login_via_telegram()
    {
        $user = User::factory()->create([
            'remember_token' => 'test-token',
            'telegram_token' => '123456789',
        ]);

        $response = $this->getJson('/auth/2fa/confirm?token=test-token');

        $response->assertRedirect('/dashboard');
    }

    /** @test */
    public function it_fails_with_invalid_chat_id()
    {
        $user = User::factory()->create([
            'remember_token' => 'test-token',
            'telegram_token' => 'invalid_chat_id',
        ]);

        Auth::login($user);

        $response = $this->postJson('/api/client/account/telegram-2fa/send-verification');

        $response->assertStatus(422);
        $response->assertJsonStructure(['errors']);
    }

    /** @test */
    public function it_fails_with_expired_token()
    {
        // Создаем пользователя с устаревшим токеном
        $user = User::factory()->create([
            'remember_token' => 'expired-token',
            'updated_at' => now()->subMinutes(10), // Токен старше 10 минут
            'telegram_token' => '123456789',
        ]);

        Auth::login($user);

        $response = $this->getJson('/auth/2fa/confirm?token=expired-token');

        $response->assertStatus(401);
        $response->assertJson(['error' => 'Token expired']);
    }

    /** @test */
    public function it_resends_telegram_token_successfully()
    {
        // Создаем пользователя с существующим токеном
        $user = User::factory()->create([
            'remember_token' => 'test-token',
            'telegram_token' => '123456789',
        ]);

        Auth::login($user);

        // Отправляем запрос на повторную отправку токена
        $response = $this->postJson('/api/client/auth/resend-verification', [
            'token' => 'test-token'
        ]);

        $response->assertOk();
        
        // Проверяем, что токен был обновлен
        $this->assertNotEquals('test-token', $user->fresh()->remember_token);
    }

    /** @test */
    public function it_blocks_after_max_verification_attempts()
    {
        // Создаем пользователя с токеном
        $user = User::factory()->create([
            'remember_token' => 'test-token',
            'telegram_token' => '123456789',
        ]);

        // Устанавливаем максимальное количество попыток
        $maxAttempts = config('auth.two_factor.max_verification_attempts', 5);
        
        // Пытаемся подтвердить вход максимальное количество раз + 1
        for ($i = 0; $i <= $maxAttempts; $i++) {
            $response = $this->getJson('/auth/2fa/confirm?token=invalid-token');
            
            if ($i < $maxAttempts) {
                $response->assertStatus(401);
                $response->assertJson(['error' => 'Invalid token']);
            } else {
                $response->assertStatus(429);
                $response->assertJson(['error' => 'Max verification attempts exceeded']);
            }
        }
    }

    /** @test */
    public function it_blocks_too_frequent_resend_requests()
    {
        // Создаем пользователя с токеном
        $user = User::factory()->create([
            'remember_token' => 'test-token',
            'telegram_token' => '123456789',
        ]);

        Auth::login($user);

        // Устанавливаем минимальную задержку между запросами
        $minDelay = config('auth.two_factor.verification_attempt_delay', 10);
        
        // Первый запрос должен быть успешным
        $response = $this->postJson('/api/client/auth/resend-verification', [
            'token' => 'test-token'
        ]);
        
        $response->assertOk();
        
        // Второй запрос сразу после первого должен быть заблокирован
        $response = $this->postJson('/api/client/auth/resend-verification', [
            'token' => 'test-token'
        ]);
        
        $response->assertStatus(422);
        $response->assertJson(['error' => 'Please wait before retrying']);
    }
}
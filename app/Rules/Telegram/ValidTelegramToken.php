<?php

namespace SparkPanel\Rules\Telegram;

use Illuminate\Contracts\Validation\Rule;

class ValidTelegramToken implements Rule
{
    /**
     * Run the validation rule.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // Проверяем, что токен соответствует формату Telegram bot token
        // Формат: 123456789:ABCdefGHIJKLmnopqRTUVwXYz (цифры и буквы)
        if (!preg_match('/^\d{8,10}:[a-zA-Z0-9_-]{35}$/', $value)) {
            $fail('validation.telegram_token_format');
        }

        // Проверяем длину токена
        if (strlen($value) < 40 || strlen($value) > 45) {
            $fail('validation.telegram_token_length');
        }
    }
}
<?php

namespace SparkPanel\Rules\Telegram;

use Illuminate\Contracts\Validation\Rule;

class ValidTelegramChatId implements Rule
{
    /**
     * Run the validation rule.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // Проверяем, что chat_id является числом
        if (!is_numeric($value)) {
            $fail('validation.telegram_chat_id_must_be_number');
            return;
        }

        // Проверяем длину chat_id (обычно от 5 до 15 цифр)
        $length = strlen((string)$value);
        if ($length < 5 || $length > 15) {
            $fail('validation.telegram_chat_id_length');
        }
    }
}
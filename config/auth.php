'providers' => [
    'users' => [
        'driver' => 'eloquent',
        'model' => SparkPanel\Models\User::class,
    ],
],

'guards' => [
    'web' => [
        'driver' => 'session',
        'provider' => 'users',
    ],

    'api' => [
        'driver' => 'token',
        'provider' => 'users',
        'hash' => false,
    ],
],

// Настройки двухфакторной аутентификации через Telegram
'two_factor' => [
    // Включена ли двухфакторная аутентификация для панели
    'enabled' => env('PANEL_TWO_FACTOR_ENABLED', true),
    
    // Тип двухфакторной аутентификации по умолчанию
    'default_type' => 'telegram',
    
    // Время жизни токена подтверждения (в минутах)
    'token_lifetime' => 5,
    
    // Интервал проверки истечения срока действия токена (в секундах)
    'token_check_interval' => 30,
    
    // Максимальное количество попыток подтверждения
    'max_verification_attempts' => 5,

    // Задержка между попытками подтверждения (в секундах)
    'verification_attempt_delay' => 10,

    // Максимальное количество попыток подтверждения
    'max_verification_attempts' => 5,

    // Задержка между попытками подтверждения (в секундах)
    'verification_attempt_delay' => 10,

    // Должны ли пользователи проходить двухфакторную аутентификацию при каждом входе
    'always_require' => env('PANEL_TWO_FACTOR_ALWAYS_REQUIRE', false),
],

// Настройки Telegram бота для двухфакторной аутентификации
'telegram' => [
    // Токен Telegram бота из .env файла
    'bot_token' => env('TELEGRAM_BOT_TOKEN'),
    
    // Должен ли Telegram chat_id быть числом
    'require_numeric_chat_id' => true,
    
    // Максимальное время ожидания ответа от Telegram API (в секундах)
    'api_timeout' => 10,
    
    // URL для вебхука Telegram (если используется)
    'webhook_url' => null,
],
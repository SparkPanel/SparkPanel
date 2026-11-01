ALTER TABLE "users" DROP COLUMN "telegram_bot_token";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "telegram_chat_id";--> statement-breakpoint
-- 2FA через Telegram больше не поддерживается: у таких пользователей 2FA выключается до настройки приложения-аутентификатора.
UPDATE "users" SET "two_factor_enabled" = false WHERE "two_factor_secret" IS NULL;

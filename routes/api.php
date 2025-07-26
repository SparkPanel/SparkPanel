
use Illuminate\Support\Facades\Route;
use SparkPanel\Http\Middleware\RequireTelegramBotToken;
use SparkPanel\Http\Middleware\EnsureTwoFactorAuthenticationEnabled;
use App\Http\Controllers\TelegramTwoFactorController; // Make sure to create this controller

Route::prefix('client')->group(function () {
    Route::middleware(['auth:sanctum', 'verified'])->group(function () {
        Route::get('/dashboard', function () {
            return view('client.dashboard');
        })->name('client.dashboard');

        Route::prefix('account')->group(function () {
            Route::get('/settings', function () {
                return view('client.account.settings');
            })->name('client.account.settings');

            Route::get('/security', function () {
                return view('client.account.security');
            })->name('client.account.security');

            Route::prefix('telegram-2fa')->group(function () {
                Route::middleware([RequireTelegramBotToken::class, EnsureTwoFactorAuthenticationEnabled::class])->group(function () {
                    // Enable Telegram Two-Factor Authentication
                    Route::post('/enable', [TelegramTwoFactorController::class, 'enable'])
                        ->name('telegram.two-factor.enable');

                    // Send verification request
                    Route::post('/send-verification', [TelegramTwoFactorController::class, 'sendVerification'])
                        ->name('telegram.two-factor.send-verification');

                    // Resend verification token with authentication and throttling middleware
                    Route::post('/resend-verification', [TelegramTwoFactorController::class, 'resendVerification'])
                        ->middleware(['auth:sanctum', 'throttle:auth.telegram.resend'])
                        ->name('telegram.two-factor.resend-verification');
                });

                // Confirm login verification
                Route::get('/confirm', [TelegramTwoFactorController::class, 'confirmVerification'])
                    ->name('telegram.two-factor.confirm-verification');

                // Check token status
                Route::get('/check-token', [TelegramTwoFactorController::class, 'checkToken'])
                    ->name('telegram.two-factor.check-token');
            });
        });
    });
});
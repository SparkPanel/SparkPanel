<?php

namespace SparkPanel\Providers;

use SparkPanel\Models;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\URL;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use SparkPanel\Extensions\Themes\Theme;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Log;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Schema::defaultStringLength(191);

        View::share('appVersion', $this->versionData()['version'] ?? '1.0.0');
        View::share('appIsGit', $this->versionData()['is_git'] ?? false);

        Paginator::useBootstrap();

        Relation::enforceMorphMap([
            'allocation' => Models\Allocation::class,
            'api_key' => Models\ApiKey::class,
            'backup' => Models\Backup::class,
            'database' => Models\Database::class,
            'egg' => Models\Egg::class,
            'egg_variable' => Models\EggVariable::class,
            'schedule' => Models\Schedule::class,
            'server' => Models\Server::class,
            'ssh_key' => Models\UserSSHKey::class,
            'task' => Models\Task::class,
            'user' => Models\User::class,
        ]);
    }

    /**
     * Register application service providers.
     */
    public function register(): void
    {
        // Only load the settings service provider if the environment
        // is configured to allow it.
        if (!config('SparkPanel.load_environment_only', false) && $this->app->environment() !== 'testing') {
            $this->app->register(SettingsServiceProvider::class);
        }
    }

    /**
     * Return version information for the footer.
     */
    protected function versionData(): array
    {
        return Cache::remember('git-version', 5, function () {
            if (!file_exists(base_path('.git/HEAD'))) {
                return [
                    'version' => config('app.version', '1.0.0'),
                    'is_git' => false,
                ];
            }

            try {
                $head = explode(' ', file_get_contents(base_path('.git/HEAD')));

                if (array_key_exists(1, $head)) {
                    $path = base_path('.git/' . trim($head[1]));
                }

                if (isset($path) && file_exists($path)) {
                    return [
                        'version' => substr(file_get_contents($path), 0, 8),
                        'is_git' => true,
                    ];
                }
            } catch (\Exception $e) {
                // Log the error but continue
                Log::error('Failed to get git version: ' . $e->getMessage());
            }

            return [
                'version' => config('app.version', '1.0.0'),
                'is_git' => false,
            ];
        });
    }
}

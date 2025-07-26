<?php

namespace SparkPanel\Providers;

use Illuminate\Support\ServiceProvider;
use SparkPanel\Repositories\Eloquent\EggRepository;
use SparkPanel\Repositories\Eloquent\NestRepository;
use SparkPanel\Repositories\Eloquent\NodeRepository;
use SparkPanel\Repositories\Eloquent\TaskRepository;
use SparkPanel\Repositories\Eloquent\UserRepository;
use SparkPanel\Repositories\Eloquent\ApiKeyRepository;
use SparkPanel\Repositories\Eloquent\ServerRepository;
use SparkPanel\Repositories\Eloquent\SessionRepository;
use SparkPanel\Repositories\Eloquent\SubuserRepository;
use SparkPanel\Repositories\Eloquent\DatabaseRepository;
use SparkPanel\Repositories\Eloquent\LocationRepository;
use SparkPanel\Repositories\Eloquent\ScheduleRepository;
use SparkPanel\Repositories\Eloquent\SettingsRepository;
use SparkPanel\Repositories\Eloquent\AllocationRepository;
use SparkPanel\Contracts\Repository\EggRepositoryInterface;
use SparkPanel\Repositories\Eloquent\EggVariableRepository;
use SparkPanel\Contracts\Repository\NestRepositoryInterface;
use SparkPanel\Contracts\Repository\NodeRepositoryInterface;
use SparkPanel\Contracts\Repository\TaskRepositoryInterface;
use SparkPanel\Contracts\Repository\UserRepositoryInterface;
use SparkPanel\Repositories\Eloquent\DatabaseHostRepository;
use SparkPanel\Contracts\Repository\ApiKeyRepositoryInterface;
use SparkPanel\Contracts\Repository\ServerRepositoryInterface;
use SparkPanel\Repositories\Eloquent\ServerVariableRepository;
use SparkPanel\Contracts\Repository\SessionRepositoryInterface;
use SparkPanel\Contracts\Repository\SubuserRepositoryInterface;
use SparkPanel\Contracts\Repository\DatabaseRepositoryInterface;
use SparkPanel\Contracts\Repository\LocationRepositoryInterface;
use SparkPanel\Contracts\Repository\ScheduleRepositoryInterface;
use SparkPanel\Contracts\Repository\SettingsRepositoryInterface;
use SparkPanel\Contracts\Repository\AllocationRepositoryInterface;
use SparkPanel\Contracts\Repository\EggVariableRepositoryInterface;
use SparkPanel\Contracts\Repository\DatabaseHostRepositoryInterface;
use SparkPanel\Contracts\Repository\ServerVariableRepositoryInterface;

class RepositoryServiceProvider extends ServiceProvider
{
    /**
     * Register all the repository bindings.
     */
    public function register(): void
    {
        // Eloquent Repositories
        $this->app->bind(AllocationRepositoryInterface::class, AllocationRepository::class);
        $this->app->bind(ApiKeyRepositoryInterface::class, ApiKeyRepository::class);
        $this->app->bind(DatabaseRepositoryInterface::class, DatabaseRepository::class);
        $this->app->bind(DatabaseHostRepositoryInterface::class, DatabaseHostRepository::class);
        $this->app->bind(EggRepositoryInterface::class, EggRepository::class);
        $this->app->bind(EggVariableRepositoryInterface::class, EggVariableRepository::class);
        $this->app->bind(LocationRepositoryInterface::class, LocationRepository::class);
        $this->app->bind(NestRepositoryInterface::class, NestRepository::class);
        $this->app->bind(NodeRepositoryInterface::class, NodeRepository::class);
        $this->app->bind(ScheduleRepositoryInterface::class, ScheduleRepository::class);
        $this->app->bind(ServerRepositoryInterface::class, ServerRepository::class);
        $this->app->bind(ServerVariableRepositoryInterface::class, ServerVariableRepository::class);
        $this->app->bind(SessionRepositoryInterface::class, SessionRepository::class);
        $this->app->bind(SettingsRepositoryInterface::class, SettingsRepository::class);
        $this->app->bind(SubuserRepositoryInterface::class, SubuserRepository::class);
        $this->app->bind(TaskRepositoryInterface::class, TaskRepository::class);
        $this->app->bind(UserRepositoryInterface::class, UserRepository::class);
    }
}

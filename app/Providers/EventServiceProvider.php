<?php

namespace SparkPanel\Providers;

use SparkPanel\Models\User;
use SparkPanel\Models\Server;
use SparkPanel\Models\Subuser;
use SparkPanel\Models\EggVariable;
use SparkPanel\Observers\UserObserver;
use SparkPanel\Observers\ServerObserver;
use SparkPanel\Observers\SubuserObserver;
use SparkPanel\Observers\EggVariableObserver;
use SparkPanel\Listeners\Auth\AuthenticationListener;
use SparkPanel\Events\Server\Installed as ServerInstalledEvent;
use SparkPanel\Notifications\ServerInstalled as ServerInstalledNotification;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

class EventServiceProvider extends ServiceProvider
{
    /**
     * The event to listener mappings for the application.
     */
    protected $listen = [
        ServerInstalledEvent::class => [ServerInstalledNotification::class],
    ];

    protected $subscribe = [
        AuthenticationListener::class,
    ];

    /**
     * Register any events for your application.
     */
    public function boot(): void
    {
        parent::boot();

        User::observe(UserObserver::class);
        Server::observe(ServerObserver::class);
        Subuser::observe(SubuserObserver::class);
        EggVariable::observe(EggVariableObserver::class);
    }
}

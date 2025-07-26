<?php

namespace SparkPanel\Facades;

use Illuminate\Support\Facades\Facade;
use SparkPanel\Services\Activity\ActivityLogTargetableService;

class LogTarget extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return ActivityLogTargetableService::class;
    }
}

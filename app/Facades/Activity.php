<?php

namespace SparkPanel\Facades;

use Illuminate\Support\Facades\Facade;
use SparkPanel\Services\Activity\ActivityLogService;

class Activity extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return ActivityLogService::class;
    }
}

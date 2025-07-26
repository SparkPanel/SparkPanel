<?php

namespace SparkPanel\Facades;

use Illuminate\Support\Facades\Facade;
use SparkPanel\Services\Activity\ActivityLogBatchService;

class LogBatch extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return ActivityLogBatchService::class;
    }
}

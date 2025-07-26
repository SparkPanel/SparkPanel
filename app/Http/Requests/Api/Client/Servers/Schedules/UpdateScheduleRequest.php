<?php

namespace SparkPanel\Http\Requests\Api\Client\Servers\Schedules;

use SparkPanel\Models\Permission;

class UpdateScheduleRequest extends StoreScheduleRequest
{
    public function permission(): string
    {
        return Permission::ACTION_SCHEDULE_UPDATE;
    }
}

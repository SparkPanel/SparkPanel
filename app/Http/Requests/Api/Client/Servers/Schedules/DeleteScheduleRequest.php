<?php

namespace SparkPanel\Http\Requests\Api\Client\Servers\Schedules;

use SparkPanel\Models\Permission;

class DeleteScheduleRequest extends ViewScheduleRequest
{
    public function permission(): string
    {
        return Permission::ACTION_SCHEDULE_DELETE;
    }
}

<?php

namespace SparkPanel\Http\Requests\Api\Client\Servers\Subusers;

use SparkPanel\Models\Permission;

class DeleteSubuserRequest extends SubuserRequest
{
    public function permission(): string
    {
        return Permission::ACTION_USER_DELETE;
    }
}

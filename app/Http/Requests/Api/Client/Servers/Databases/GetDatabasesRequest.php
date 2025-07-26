<?php

namespace SparkPanel\Http\Requests\Api\Client\Servers\Databases;

use SparkPanel\Models\Permission;
use SparkPanel\Contracts\Http\ClientPermissionsRequest;
use SparkPanel\Http\Requests\Api\Client\ClientApiRequest;

class GetDatabasesRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_DATABASE_READ;
    }
}

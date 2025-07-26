<?php

namespace SparkPanel\Http\Requests\Api\Application\Servers\Databases;

use SparkPanel\Services\Acl\Api\AdminAcl;

class ServerDatabaseWriteRequest extends GetServerDatabasesRequest
{
    protected int $permission = AdminAcl::WRITE;
}

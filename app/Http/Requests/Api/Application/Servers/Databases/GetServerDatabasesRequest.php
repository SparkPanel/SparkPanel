<?php

namespace SparkPanel\Http\Requests\Api\Application\Servers\Databases;

use SparkPanel\Services\Acl\Api\AdminAcl;
use SparkPanel\Http\Requests\Api\Application\ApplicationApiRequest;

class GetServerDatabasesRequest extends ApplicationApiRequest
{
    protected ?string $resource = AdminAcl::RESOURCE_SERVER_DATABASES;

    protected int $permission = AdminAcl::READ;
}

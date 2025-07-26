<?php

namespace SparkPanel\Http\Requests\Api\Application\Servers;

use SparkPanel\Services\Acl\Api\AdminAcl;
use SparkPanel\Http\Requests\Api\Application\ApplicationApiRequest;

class GetServerRequest extends ApplicationApiRequest
{
    protected ?string $resource = AdminAcl::RESOURCE_SERVERS;

    protected int $permission = AdminAcl::READ;
}

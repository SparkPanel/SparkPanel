<?php

namespace SparkPanel\Http\Requests\Api\Application\Nodes;

use SparkPanel\Services\Acl\Api\AdminAcl;
use SparkPanel\Http\Requests\Api\Application\ApplicationApiRequest;

class GetNodesRequest extends ApplicationApiRequest
{
    protected ?string $resource = AdminAcl::RESOURCE_NODES;

    protected int $permission = AdminAcl::READ;
}

<?php

namespace SparkPanel\Http\Requests\Api\Application\Users;

use SparkPanel\Services\Acl\Api\AdminAcl;
use SparkPanel\Http\Requests\Api\Application\ApplicationApiRequest;

class DeleteUserRequest extends ApplicationApiRequest
{
    protected ?string $resource = AdminAcl::RESOURCE_USERS;

    protected int $permission = AdminAcl::WRITE;
}

<?php

namespace SparkPanel\Http\Requests\Api\Application\Users;

use SparkPanel\Services\Acl\Api\AdminAcl as Acl;
use SparkPanel\Http\Requests\Api\Application\ApplicationApiRequest;

class GetUsersRequest extends ApplicationApiRequest
{
    protected ?string $resource = Acl::RESOURCE_USERS;

    protected int $permission = Acl::READ;
}

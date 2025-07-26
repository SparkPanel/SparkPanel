<?php

namespace SparkPanel\Repositories\Eloquent;

use SparkPanel\Models\User;
use SparkPanel\Contracts\Repository\UserRepositoryInterface;

class UserRepository extends EloquentRepository implements UserRepositoryInterface
{
    /**
     * Return the model backing this repository.
     */
    public function model(): string
    {
        return User::class;
    }
}

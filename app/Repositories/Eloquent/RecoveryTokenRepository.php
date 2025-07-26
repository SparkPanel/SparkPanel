<?php

namespace SparkPanel\Repositories\Eloquent;

use SparkPanel\Models\RecoveryToken;

class RecoveryTokenRepository extends EloquentRepository
{
    public function model(): string
    {
        return RecoveryToken::class;
    }
}

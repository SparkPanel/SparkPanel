<?php

namespace SparkPanel\Exceptions\Repository;

use SparkPanel\Exceptions\DisplayException;

class DuplicateDatabaseNameException extends DisplayException
{
    public function __construct()
    {
        parent::__construct('A database with this name already exists.');
    }
}
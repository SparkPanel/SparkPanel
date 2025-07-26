<?php

namespace SparkPanel\Exceptions\Service\Database;

use SparkPanel\Exceptions\SparkPanelException;

class DatabaseClientFeatureNotEnabledException extends SparkPanelException
{
    public function __construct()
    {
        parent::__construct('Client database creation is not enabled in this Panel.');
    }
}

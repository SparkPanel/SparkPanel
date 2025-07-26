<?php

namespace SparkPanel\Exceptions\Service\Backup;

use SparkPanel\Exceptions\DisplayException;

class BackupLockedException extends DisplayException
{
    /**
     * TooManyBackupsException constructor.
     */
    public function __construct()
    {
        parent::__construct('Cannot delete a backup that is marked as locked.');
    }
}

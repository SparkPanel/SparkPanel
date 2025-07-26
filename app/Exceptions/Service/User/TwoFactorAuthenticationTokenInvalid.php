<?php

namespace SparkPanel\Exceptions\Service\User;

use SparkPanel\Exceptions\DisplayException;

class TwoFactorAuthenticationTokenInvalid extends DisplayException
{
    /**
     * TwoFactorAuthenticationTokenInvalid constructor.
     */
    public function __construct()
    {
        parent::__construct('The provided two-factor authentication token was not valid.');
    }
}

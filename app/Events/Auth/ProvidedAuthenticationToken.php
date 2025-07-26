<?php

namespace SparkPanel\Events\Auth;

use SparkPanel\Models\User;
use SparkPanel\Events\Event;

class ProvidedAuthenticationToken extends Event
{
    public function __construct(public User $user, public bool $recovery = false)
    {
    }
}

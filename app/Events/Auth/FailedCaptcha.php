<?php

namespace SparkPanel\Events\Auth;

use SparkPanel\Events\Event;
use Illuminate\Queue\SerializesModels;

class FailedCaptcha extends Event
{
    use SerializesModels;

    /**
     * Create a new event instance.
     */
    public function __construct(public string $ip, public string $domain)
    {
    }
}

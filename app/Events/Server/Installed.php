<?php

namespace SparkPanel\Events\Server;

use SparkPanel\Events\Event;
use SparkPanel\Models\Server;
use Illuminate\Queue\SerializesModels;

class Installed extends Event
{
    use SerializesModels;

    /**
     * Create a new event instance.
     */
    public function __construct(public Server $server)
    {
    }
}

<?php

namespace SparkPanel\Events\Subuser;

use SparkPanel\Events\Event;
use SparkPanel\Models\Subuser;
use Illuminate\Queue\SerializesModels;

class Deleting extends Event
{
    use SerializesModels;

    /**
     * Create a new event instance.
     */
    public function __construct(public Subuser $subuser)
    {
    }
}

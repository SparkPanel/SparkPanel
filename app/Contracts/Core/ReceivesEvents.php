<?php

namespace SparkPanel\Contracts\Core;

use SparkPanel\Events\Event;

interface ReceivesEvents
{
    /**
     * Handles receiving an event from the application.
     */
    public function handle(Event $notification): void;
}

<?php

namespace SparkPanel\Notifications;

use SparkPanel\Models\User;
use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;

class MailTested extends Notification
{
    public function __construct(private User $user)
    {
    }

    public function via(): array
    {
        return ['mail'];
    }

    public function toMail(): MailMessage
    {
        return (new MailMessage())
            ->subject('SparkPanel Test Message')
            ->greeting('Hello ' . $this->user->name . '!')
            ->line('This is a test of the SparkPanel mail system. You\'re good to go!');
    }
}

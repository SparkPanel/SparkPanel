<?php

namespace SparkPanel\Console\Commands\Overrides;

use SparkPanel\Console\RequiresDatabaseMigrations;
use Illuminate\Foundation\Console\UpCommand as BaseUpCommand;

class UpCommand extends BaseUpCommand
{
    use RequiresDatabaseMigrations;

    /**
     * Block someone from running this up command if they have not completed
     * the migration process.
     */
    public function handle(): int
    {
        if (!$this->hasCompletedMigrations()) {
            $this->showMigrationWarning();

            return 1;
        }

        return parent::handle() ?? 0;
    }
}

<?php

namespace SparkPanel\Traits\Commands;

use SparkPanel\Exceptions\SparkPanelException;

trait EnvironmentWriterTrait
{
    /**
     * Escapes an environment value by looking for any characters that could
     * reasonably cause environment parsing issues. Those values are then wrapped
     * in quotes before being returned.
     */
    public function escapeEnvironmentValue(?string $value): string
    {
        if (is_null($value)) {
            return '';
        }

        if (!preg_match('/^\"(.*)\"$/', $value) && preg_match('/([^\w.\-+\/])+/', $value)) {
            return sprintf('"%s"', addslashes($value));
        }

        return $value;
    }

    /**
     * Update the .env file for the application using the passed in values.
     *
     * @throws SparkPanelException
     */
    public function writeToEnvironment(array $values = []): void
    {
        $path = base_path('.env');
        if (!file_exists($path)) {
            throw new SparkPanelException('Cannot locate .env file, was this software installed correctly?');
        }

        $saveContents = file_get_contents($path);
        collect($values)->each(function ($value, $key) use (&$saveContents) {
            $key = strtoupper($key);
            $saveValue = sprintf('%s=%s', $key, $this->escapeEnvironmentValue($value));

            if (preg_match_all('/^' . $key . '=(.*)$/m', $saveContents) < 1) {
                $saveContents = $saveContents . PHP_EOL . $saveValue;
            } else {
                $saveContents = preg_replace('/^' . $key . '=(.*)$/m', $saveValue, $saveContents);
            }
        });

        file_put_contents($path, $saveContents);
    }
}

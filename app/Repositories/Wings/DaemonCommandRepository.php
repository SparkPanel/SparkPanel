<?php

namespace SparkPanel\Repositories\Wings;

use Webmozart\Assert\Assert;
use SparkPanel\Models\Server;
use Psr\Http\Message\ResponseInterface;
use GuzzleHttp\Exception\TransferException;
use SparkPanel\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * @method \SparkPanel\Repositories\Wings\DaemonCommandRepository setNode(\SparkPanel\Models\Node $node)
 * @method \SparkPanel\Repositories\Wings\DaemonCommandRepository setServer(\SparkPanel\Models\Server $server)
 */
class DaemonCommandRepository extends DaemonRepository
{
    /**
     * Sends a command or multiple commands to a running server instance.
     *
     * @throws DaemonConnectionException
     */
    public function send(array|string $command): ResponseInterface
    {
        Assert::isInstanceOf($this->server, Server::class);

        try {
            return $this->getHttpClient()->post(
                sprintf('/api/servers/%s/commands', $this->server->uuid),
                [
                    'json' => ['commands' => is_array($command) ? $command : [$command]],
                ]
            );
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }
}

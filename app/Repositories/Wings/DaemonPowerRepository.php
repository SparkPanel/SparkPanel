<?php

namespace SparkPanel\Repositories\Wings;

use Webmozart\Assert\Assert;
use SparkPanel\Models\Server;
use Psr\Http\Message\ResponseInterface;
use GuzzleHttp\Exception\TransferException;
use SparkPanel\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * @method \SparkPanel\Repositories\Wings\DaemonPowerRepository setNode(\SparkPanel\Models\Node $node)
 * @method \SparkPanel\Repositories\Wings\DaemonPowerRepository setServer(\SparkPanel\Models\Server $server)
 */
class DaemonPowerRepository extends DaemonRepository
{
    /**
     * Sends a power action to the server instance.
     *
     * @throws DaemonConnectionException
     */
    public function send(string $action): ResponseInterface
    {
        Assert::isInstanceOf($this->server, Server::class);

        try {
            return $this->getHttpClient()->post(
                sprintf('/api/servers/%s/power', $this->server->uuid),
                ['json' => ['action' => $action]]
            );
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }
}

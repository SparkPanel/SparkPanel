<?php

namespace SparkPanel\Repositories\Wings;

use GuzzleHttp\Client;
use SparkPanel\Models\Node;
use Webmozart\Assert\Assert;
use SparkPanel\Models\Server;
use Illuminate\Contracts\Foundation\Application;

/**
 * @method \SparkPanel\Repositories\Wings\DaemonRepository setNode(\SparkPanel\Models\Node $node)
 * @method \SparkPanel\Repositories\Wings\DaemonRepository setServer(\SparkPanel\Models\Server $server)
 */
abstract class DaemonRepository
{
    protected ?Server $server;

    protected ?Node $node;

    /**
     * DaemonRepository constructor.
     */
    public function __construct(protected Application $app)
    {
    }

    /**
     * Set the server model this request is stemming from.
     */
    public function setServer(Server $server): self
    {
        $this->server = $server;

        $this->setNode($this->server->node);

        return $this;
    }

    /**
     * Set the node model this request is stemming from.
     */
    public function setNode(Node $node): self
    {
        $this->node = $node;

        return $this;
    }

    /**
     * Return an instance of the Guzzle HTTP Client to be used for requests.
     */
    public function getHttpClient(array $headers = []): Client
    {
        Assert::isInstanceOf($this->node, Node::class);

        return new Client([
            'verify' => $this->app->environment('production'),
            'base_uri' => $this->node->getConnectionAddress(),
            'timeout' => config('SparkPanel.guzzle.timeout'),
            'connect_timeout' => config('SparkPanel.guzzle.connect_timeout'),
            'headers' => array_merge($headers, [
                'Authorization' => 'Bearer ' . $this->node->getDecryptedKey(),
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ]),
        ]);
    }
}

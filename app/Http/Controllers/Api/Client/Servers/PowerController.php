<?php

namespace SparkPanel\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Response;
use SparkPanel\Models\Server;
use SparkPanel\Facades\Activity;
use SparkPanel\Repositories\Wings\DaemonPowerRepository;
use SparkPanel\Http\Controllers\Api\Client\ClientApiController;
use SparkPanel\Http\Requests\Api\Client\Servers\SendPowerRequest;

class PowerController extends ClientApiController
{
    /**
     * PowerController constructor.
     */
    public function __construct(private DaemonPowerRepository $repository)
    {
        parent::__construct();
    }

    /**
     * Send a power action to a server.
     */
    public function index(SendPowerRequest $request, Server $server): Response
    {
        $this->repository->setServer($server)->send(
            $request->input('signal')
        );

        Activity::event(strtolower("server:power.{$request->input('signal')}"))->log();

        return $this->returnNoContent();
    }
}

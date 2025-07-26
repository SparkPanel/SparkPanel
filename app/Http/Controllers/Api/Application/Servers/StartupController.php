<?php

namespace SparkPanel\Http\Controllers\Api\Application\Servers;

use SparkPanel\Models\User;
use SparkPanel\Models\Server;
use SparkPanel\Services\Servers\StartupModificationService;
use SparkPanel\Transformers\Api\Application\ServerTransformer;
use SparkPanel\Http\Controllers\Api\Application\ApplicationApiController;
use SparkPanel\Http\Requests\Api\Application\Servers\UpdateServerStartupRequest;

class StartupController extends ApplicationApiController
{
    /**
     * StartupController constructor.
     */
    public function __construct(private StartupModificationService $modificationService)
    {
        parent::__construct();
    }

    /**
     * Update the startup and environment settings for a specific server.
     *
     * @throws \Illuminate\Validation\ValidationException
     * @throws \SparkPanel\Exceptions\Http\Connection\DaemonConnectionException
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     * @throws \SparkPanel\Exceptions\Repository\RecordNotFoundException
     */
    public function index(UpdateServerStartupRequest $request, Server $server): array
    {
        $server = $this->modificationService
            ->setUserLevel(User::USER_LEVEL_ADMIN)
            ->handle($server, $request->validated());

        return $this->fractal->item($server)
            ->transformWith($this->getTransformer(ServerTransformer::class))
            ->toArray();
    }
}

<?php

namespace SparkPanel\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Response;
use SparkPanel\Models\Server;
use SparkPanel\Models\Database;
use SparkPanel\Facades\Activity;
use SparkPanel\Services\Databases\DatabasePasswordService;
use SparkPanel\Transformers\Api\Client\DatabaseTransformer;
use SparkPanel\Services\Databases\DatabaseManagementService;
use SparkPanel\Services\Databases\DeployServerDatabaseService;
use SparkPanel\Http\Controllers\Api\Client\ClientApiController;
use SparkPanel\Http\Requests\Api\Client\Servers\Databases\GetDatabasesRequest;
use SparkPanel\Http\Requests\Api\Client\Servers\Databases\StoreDatabaseRequest;
use SparkPanel\Http\Requests\Api\Client\Servers\Databases\DeleteDatabaseRequest;
use SparkPanel\Http\Requests\Api\Client\Servers\Databases\RotatePasswordRequest;

class DatabaseController extends ClientApiController
{
    /**
     * DatabaseController constructor.
     */
    public function __construct(
        private DeployServerDatabaseService $deployDatabaseService,
        private DatabaseManagementService $managementService,
        private DatabasePasswordService $passwordService,
    ) {
        parent::__construct();
    }

    /**
     * Return all the databases that belong to the given server.
     */
    public function index(GetDatabasesRequest $request, Server $server): array
    {
        return $this->fractal->collection($server->databases)
            ->transformWith($this->getTransformer(DatabaseTransformer::class))
            ->toArray();
    }

    /**
     * Create a new database for the given server and return it.
     *
     * @throws \Throwable
     * @throws \SparkPanel\Exceptions\Service\Database\TooManyDatabasesException
     * @throws \SparkPanel\Exceptions\Service\Database\DatabaseClientFeatureNotEnabledException
     */
    public function store(StoreDatabaseRequest $request, Server $server): array
    {
        $database = $this->deployDatabaseService->handle($server, $request->validated());

        Activity::event('server:database.create')
            ->subject($database)
            ->property('name', $database->database)
            ->log();

        return $this->fractal->item($database)
            ->parseIncludes(['password'])
            ->transformWith($this->getTransformer(DatabaseTransformer::class))
            ->toArray();
    }

    /**
     * Rotates the password for the given server model and returns a fresh instance to
     * the caller.
     *
     * @throws \Throwable
     */
    public function rotatePassword(RotatePasswordRequest $request, Server $server, Database $database): array
    {
        $this->passwordService->handle($database);
        $database->refresh();

        Activity::event('server:database.rotate-password')
            ->subject($database)
            ->property('name', $database->database)
            ->log();

        return $this->fractal->item($database)
            ->parseIncludes(['password'])
            ->transformWith($this->getTransformer(DatabaseTransformer::class))
            ->toArray();
    }

    /**
     * Removes a database from the server.
     *
     * @throws \SparkPanel\Exceptions\Repository\RecordNotFoundException
     */
    public function delete(DeleteDatabaseRequest $request, Server $server, Database $database): Response
    {
        $this->managementService->delete($database);

        Activity::event('server:database.delete')
            ->subject($database)
            ->property('name', $database->database)
            ->log();

        return new Response('', Response::HTTP_NO_CONTENT);
    }
}

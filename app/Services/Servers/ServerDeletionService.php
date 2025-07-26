<?php

namespace SparkPanel\Services\Servers;

use Illuminate\Http\Response;
use SparkPanel\Models\Server;
use Illuminate\Support\Facades\Log;
use Illuminate\Database\ConnectionInterface;
use SparkPanel\Repositories\Wings\DaemonServerRepository;
use SparkPanel\Services\Databases\DatabaseManagementService;
use SparkPanel\Exceptions\Http\Connection\DaemonConnectionException;

class ServerDeletionService
{
    protected bool $force = false;

    /**
     * ServerDeletionService constructor.
     */
    public function __construct(
        private ConnectionInterface $connection,
        private DaemonServerRepository $daemonServerRepository,
        private DatabaseManagementService $databaseManagementService,
    ) {
    }

    /**
     * Set if the server should be forcibly deleted from the panel (ignoring daemon errors) or not.
     */
    public function withForce(bool $bool = true): self
    {
        $this->force = $bool;

        return $this;
    }

    /**
     * Delete a server from the panel and remove any associated databases from hosts.
     *
     * @throws \Throwable
     * @throws \SparkPanel\Exceptions\DisplayException
     */
    public function handle(Server $server): void
    {
        try {
            // First try to delete the server from the daemon
            $this->daemonServerRepository->setServer($server)->delete();
        } catch (DaemonConnectionException $exception) {
            // If there is an error not caused by a 404 error and this isn't a forced delete,
            // go ahead and bail out. We specifically ignore a 404 since that can be assumed
            // to be a safe error, meaning the server doesn't exist at all on Wings so there
            // is no need to continue trying to delete it from the panel.
            if (!$this->force || $exception->getResponseStatusCode() !== Response::HTTP_NOT_FOUND) {
                throw $exception;
            }
        }

        try {
            // Delete the server from the database
            $this->connection->transaction(function () use ($server) {
                // Delete all relationships first
                $server->allocations()->detach();
                $server->databases()->delete();
                $server->schedules()->delete();
                $server->tasks()->delete();
                $server->variables()->delete();
                $server->mounts()->delete();

                // Finally delete the server itself
                $server->delete();
            });
        } catch (\Exception $e) {
            // Log the error but continue with deletion
            Log::error('Failed to delete server relationships: ' . $e->getMessage());
            
            if (!$this->force) {
                throw $e;
            }
        }
    }
}

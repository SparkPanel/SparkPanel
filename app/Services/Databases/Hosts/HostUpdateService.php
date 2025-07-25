<?php

namespace SparkPanel\Services\Databases\Hosts;

use SparkPanel\Models\DatabaseHost;
use Illuminate\Database\DatabaseManager;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Contracts\Encryption\Encrypter;
use SparkPanel\Extensions\DynamicDatabaseConnection;
use SparkPanel\Contracts\Repository\DatabaseHostRepositoryInterface;

class HostUpdateService
{
    /**
     * HostUpdateService constructor.
     */
    public function __construct(
        private ConnectionInterface $connection,
        private DatabaseManager $databaseManager,
        private DynamicDatabaseConnection $dynamic,
        private Encrypter $encrypter,
        private DatabaseHostRepositoryInterface $repository,
    ) {
    }

    /**
     * Update a database host and persist to the database.
     *
     * @throws \Throwable
     */
    public function handle(int $hostId, array $data): DatabaseHost
    {
        if (!empty(array_get($data, 'password'))) {
            $data['password'] = $this->encrypter->encrypt($data['password']);
        } else {
            unset($data['password']);
        }

        return $this->connection->transaction(function () use ($data, $hostId) {
            $host = $this->repository->update($hostId, $data);
            $this->dynamic->set('dynamic', $host);
            $this->databaseManager->connection('dynamic')->select('SELECT 1 FROM dual');

            return $host;
        });
    }
}

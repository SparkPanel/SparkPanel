<?php

namespace SparkPanel\Services\Databases\Hosts;

use SparkPanel\Models\DatabaseHost;
use Illuminate\Database\DatabaseManager;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Contracts\Encryption\Encrypter;
use SparkPanel\Extensions\DynamicDatabaseConnection;
use SparkPanel\Contracts\Repository\DatabaseHostRepositoryInterface;

class HostCreationService
{
    /**
     * HostCreationService constructor.
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
     * Create a new database host on the Panel.
     *
     * @throws \Throwable
     */
    public function handle(array $data): DatabaseHost
    {
        return $this->connection->transaction(function () use ($data) {
            $host = $this->repository->create([
                'password' => $this->encrypter->encrypt(array_get($data, 'password')),
                'name' => array_get($data, 'name'),
                'host' => array_get($data, 'host'),
                'port' => array_get($data, 'port'),
                'username' => array_get($data, 'username'),
                'max_databases' => null,
                'node_id' => array_get($data, 'node_id'),
            ]);

            // Confirm access using the provided credentials before saving data.
            $this->dynamic->set('dynamic', $host);
            $this->databaseManager->connection('dynamic')->select('SELECT 1 FROM dual');

            return $host;
        });
    }
}

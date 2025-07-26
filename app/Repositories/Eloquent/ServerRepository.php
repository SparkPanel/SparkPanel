<?php

namespace SparkPanel\Repositories\Eloquent;

use Illuminate\Support\Facades\DB;
use SparkPanel\Interfaces\ServerRepositoryInterface;

class ServerRepository implements ServerRepositoryInterface
{
    /**
     * Получить список серверов
     */
    public function getAllServers()
    {
        return DB::table('servers')->get();
    }

    /**
     * Получить сервер по ID
     */
    public function getServerById($id)
    {
        return DB::table('servers')->where('id', $id)->first();
    }

    /**
     * Сохранить новый сервер
     */
    public function createServer(array $data)
    {
        return DB::table('servers')->insertGetId($data);
    }

    /**
     * Обновить данные сервера
     */
    public function updateServer($id, array $data)
    {
        return DB::table('servers')->where('id', $id)->update($data);
    }

    /**
     * Удалить сервер
     */
    public function deleteServer($id)
    {
        return DB::table('servers')->where('id', $id)->delete();
    }
}
<?php

namespace SparkPanel\Repositories\Eloquent;

use SparkPanel\Models\Server;
use Illuminate\Support\Collection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use SparkPanel\Exceptions\Repository\RecordNotFoundException;
use SparkPanel\Repositories\Eloquent\ServerRepositoryInterface;

class ServerRepository extends EloquentRepository implements ServerRepositoryInterface
{
    /**
     * Return the model backing this repository.
     */
    public function model(): string
    {
        return Server::class;
    }

    /**
     * Load the egg relations onto the server model.
     */
    public function loadEggRelations(Server $server, bool $refresh = false): Server
    {
        if (!$server->relationLoaded('egg') || $refresh) {
            $server->load('egg.scriptFrom');
        }

        return $server;
    }

    /**
     * Return a collection of servers with their associated data for rebuild operations.
     */
    public function getDataForRebuild(?int $server = null, ?int $node = null): Collection
    {
        $instance = $this->getBuilder()->with(['allocation', 'allocations', 'egg', 'node']);

        if (!is_null($server) && is_null($node)) {
            $instance = $instance->where('id', '=', $server);
        } elseif (is_null($server) && !is_null($node)) {
            $instance = $instance->where('node_id', '=', $node);
        }

        // Limit the number of results to prevent memory issues
        return $instance->limit(1000)->get($this->getColumns());
    }

    /**
     * Return a paginated collection of servers with their associated data.
     */
    public function getPaginatedServers(int $perPage = 50, int $page = 1): LengthAwarePaginator
    {
        return $this->getBuilder()
            ->with(['allocation', 'allocations', 'egg', 'node'])
            ->paginate($perPage, $this->getColumns(), 'page', $page);
    }

    /**
     * Search servers by query.
     *
     * @param string $query Search query
     * @param int $perPage Number of results per page
     * @return \Illuminate\Contracts\Pagination\LengthAwarePaginator
     */
    public function searchServers(string $query, int $perPage = 50): LengthAwarePaginator
    {
        return $this->getBuilder()
            ->where(function (Builder $builder) use ($query) {
                $builder->where('name', 'like', "%$query%")
                    ->orWhere('description', 'like', "%$query%")
                    ->orWhere('uuid', 'like', "%$query%");
            })
            ->with(['allocation', 'allocations', 'egg', 'node'])
            ->paginate($perPage, $this->getColumns());
    }

    /**
     * Returns all the servers that exist for a given node in a paginated response.
     */
    public function loadAllServersForNode(int $node, int $limit = 50): LengthAwarePaginator
    {
        return $this->getBuilder()
            ->with(['allocation', 'user'])
            ->where('node_id', '=', $node)
            ->paginate($limit);
    }
}

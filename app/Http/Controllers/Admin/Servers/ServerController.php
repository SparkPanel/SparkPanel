<?php

namespace SparkPanel\Http\Controllers\Admin\Servers;

use Illuminate\View\View;
use Illuminate\Http\Request;
use SparkPanel\Models\Server;
use Spatie\QueryBuilder\QueryBuilder;
use Spatie\QueryBuilder\AllowedFilter;
use SparkPanel\Http\Controllers\Controller;
use SparkPanel\Models\Filters\AdminServerFilter;
use Illuminate\Contracts\View\Factory as ViewFactory;

class ServerController extends Controller
{
    /**
     * ServerController constructor.
     */
    public function __construct(private ViewFactory $view)
    {
    }

    /**
     * Returns all the servers that exist on the system using a paginated result set. If
     * a query is passed along in the request it is also passed to the repository function.
     */
    public function index(Request $request): View
    {
        $servers = QueryBuilder::for(Server::query()->with('node', 'user', 'allocation'))
            ->allowedFilters([
                AllowedFilter::exact('owner_id'),
                AllowedFilter::custom('*', new AdminServerFilter()),
            ])
            ->paginate(config()->get('SparkPanel.paginate.admin.servers'));

        return $this->view->make('admin.servers.index', ['servers' => $servers]);
    }
}

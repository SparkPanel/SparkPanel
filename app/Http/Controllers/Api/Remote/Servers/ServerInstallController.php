<?php

namespace SparkPanel\Http\Controllers\Api\Remote\Servers;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use SparkPanel\Models\Server;
use Illuminate\Http\JsonResponse;
use SparkPanel\Http\Controllers\Controller;
use SparkPanel\Repositories\Eloquent\ServerRepository;
use SparkPanel\Events\Server\Installed as ServerInstalled;
use Illuminate\Contracts\Events\Dispatcher as EventDispatcher;
use SparkPanel\Http\Requests\Api\Remote\InstallationDataRequest;

class ServerInstallController extends Controller
{
    /**
     * ServerInstallController constructor.
     */
    public function __construct(private ServerRepository $repository, private EventDispatcher $eventDispatcher)
    {
    }

    /**
     * Returns installation information for a server.
     *
     * @throws \SparkPanel\Exceptions\Repository\RecordNotFoundException
     */
    public function index(Request $request, string $uuid): JsonResponse
    {
        $server = $this->repository->getByUuid($uuid);
        $egg = $server->egg;

        return new JsonResponse([
            'container_image' => $egg->copy_script_container,
            'entrypoint' => $egg->copy_script_entry,
            'script' => $egg->copy_script_install,
        ]);
    }

    /**
     * Updates the installation state of a server.
     *
     * @throws \SparkPanel\Exceptions\Repository\RecordNotFoundException
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     */
    public function store(InstallationDataRequest $request, string $uuid): JsonResponse
    {
        $server = $this->repository->getByUuid($uuid);
        $status = null;

        // Make sure the type of failure is accurate
        if (!$request->boolean('successful')) {
            $status = Server::STATUS_INSTALL_FAILED;

            if ($request->boolean('reinstall')) {
                $status = Server::STATUS_REINSTALL_FAILED;
            }
        }

        // Keep the server suspended if it's already suspended
        if ($server->status === Server::STATUS_SUSPENDED) {
            $status = Server::STATUS_SUSPENDED;
        }

        $this->repository->update($server->id, ['status' => $status, 'installed_at' => CarbonImmutable::now()], true, true);

        // If the server successfully installed, fire installed event.
        // This logic allows individually disabling install and reinstall notifications separately.
        $isInitialInstall = is_null($server->installed_at);
        if ($isInitialInstall && config()->get('SparkPanel.email.send_install_notification', true)) {
            $this->eventDispatcher->dispatch(new ServerInstalled($server));
        } elseif (!$isInitialInstall && config()->get('SparkPanel.email.send_reinstall_notification', true)) {
            $this->eventDispatcher->dispatch(new ServerInstalled($server));
        }

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }
}

<?php

namespace SparkPanel\Http\Controllers\Api\Client\Servers;

use SparkPanel\Models\Server;
use SparkPanel\Facades\Activity;
use SparkPanel\Services\Servers\StartupCommandService;
use SparkPanel\Repositories\Eloquent\ServerVariableRepository;
use SparkPanel\Transformers\Api\Client\EggVariableTransformer;
use SparkPanel\Http\Controllers\Api\Client\ClientApiController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use SparkPanel\Http\Requests\Api\Client\Servers\Startup\GetStartupRequest;
use SparkPanel\Http\Requests\Api\Client\Servers\Startup\UpdateStartupVariableRequest;

class StartupController extends ClientApiController
{
    /**
     * StartupController constructor.
     */
    public function __construct(
        private StartupCommandService $startupCommandService,
        private ServerVariableRepository $repository,
    ) {
        parent::__construct();
    }

    /**
     * Returns the startup information for the server including all the variables.
     */
    public function index(GetStartupRequest $request, Server $server): array
    {
        $startup = $this->startupCommandService->handle($server);

        return $this->fractal->collection(
            $server->variables()->where('user_viewable', true)->get()
        )
            ->transformWith($this->getTransformer(EggVariableTransformer::class))
            ->addMeta([
                'startup_command' => $startup,
                'docker_images' => $server->egg->docker_images,
                'raw_startup_command' => $server->startup,
            ])
            ->toArray();
    }

    /**
     * Updates a single variable for a server.
     *
     * @throws \Illuminate\Validation\ValidationException
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     * @throws \SparkPanel\Exceptions\Repository\RecordNotFoundException
     */
    public function update(UpdateStartupVariableRequest $request, Server $server): array
    {
        /** @var \SparkPanel\Models\EggVariable $variable */
        $variable = $server->variables()->where('env_variable', $request->input('key'))->first();
        $original = $variable->server_value;

        if (is_null($variable) || !$variable->user_viewable) {
            throw new BadRequestHttpException('The environment variable you are trying to edit does not exist.');
        } elseif (!$variable->user_editable) {
            throw new BadRequestHttpException('The environment variable you are trying to edit is read-only.');
        }

        // Revalidate the variable value using the egg variable specific validation rules for it.
        $this->validate($request, ['value' => $variable->rules]);

        $this->repository->updateOrCreate([
            'server_id' => $server->id,
            'variable_id' => $variable->id,
        ], [
            'variable_value' => $request->input('value') ?? '',
        ]);

        $variable = $variable->refresh();
        $variable->server_value = $request->input('value');

        $startup = $this->startupCommandService->handle($server);

        if ($variable->env_variable !== $request->input('value')) {
            Activity::event('server:startup.edit')
                ->subject($variable)
                ->property([
                    'variable' => $variable->env_variable,
                    'old' => $original,
                    'new' => $request->input('value'),
                ])
                ->log();
        }

        return $this->fractal->item($variable)
            ->transformWith($this->getTransformer(EggVariableTransformer::class))
            ->addMeta([
                'startup_command' => $startup,
                'raw_startup_command' => $server->startup,
            ])
            ->toArray();
    }
}

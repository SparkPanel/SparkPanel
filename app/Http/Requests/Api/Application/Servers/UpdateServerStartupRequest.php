<?php

namespace SparkPanel\Http\Requests\Api\Application\Servers;

use SparkPanel\Models\Server;
use SparkPanel\Services\Acl\Api\AdminAcl;
use SparkPanel\Http\Requests\Api\Application\ApplicationApiRequest;

class UpdateServerStartupRequest extends ApplicationApiRequest
{
    protected ?string $resource = AdminAcl::RESOURCE_SERVERS;

    protected int $permission = AdminAcl::WRITE;

    /**
     * Validation rules to run the input against.
     */
    public function rules(): array
    {
        $data = Server::getRulesForUpdate($this->parameter('server', Server::class));

        return [
            'startup' => $data['startup'],
            'environment' => 'present|array',
            'egg' => $data['egg_id'],
            'image' => $data['image'],
            'skip_scripts' => 'present|boolean',
        ];
    }

    /**
     * Return the validated data in a format that is expected by the service.
     */
    public function validated($key = null, $default = null): array
    {
        $data = parent::validated();

        return collect($data)->only(['startup', 'environment', 'skip_scripts'])->merge([
            'egg_id' => array_get($data, 'egg'),
            'docker_image' => array_get($data, 'image'),
        ])->toArray();
    }
}

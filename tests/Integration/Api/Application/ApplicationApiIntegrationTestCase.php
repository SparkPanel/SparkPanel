<?php

namespace SparkPanel\Tests\Integration\Api\Application;

use Illuminate\Http\Request;
use SparkPanel\Models\User;
use PHPUnit\Framework\Assert;
use SparkPanel\Models\ApiKey;
use SparkPanel\Services\Acl\Api\AdminAcl;
use SparkPanel\Tests\Integration\IntegrationTestCase;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use SparkPanel\Tests\Traits\Integration\CreatesTestModels;
use SparkPanel\Transformers\Api\Application\BaseTransformer;
use SparkPanel\Transformers\Api\Client\BaseClientTransformer;
use SparkPanel\Tests\Traits\Http\IntegrationJsonRequestAssertions;

abstract class ApplicationApiIntegrationTestCase extends IntegrationTestCase
{
    use CreatesTestModels;
    use DatabaseTransactions;
    use IntegrationJsonRequestAssertions;

    private ApiKey $key;

    private User $user;

    /**
     * Bootstrap application API tests. Creates a default admin user and associated API key
     * and also sets some default headers required for accessing the API.
     */
    public function setUp(): void
    {
        parent::setUp();

        $this->user = $this->createApiUser();
        $this->key = $this->createApiKey($this->user);

        $this
            ->withHeader('Accept', 'application/vnd.SparkPanel.v1+json')
            ->withHeader('Authorization', 'Bearer ' . $this->key->identifier . decrypt($this->key->token));
    }

    public function getApiUser(): User
    {
        return $this->user;
    }

    public function getApiKey(): ApiKey
    {
        return $this->key;
    }

    /**
     * Creates a new default API key and refreshes the headers using it.
     */
    protected function createNewDefaultApiKey(User $user, array $permissions = []): ApiKey
    {
        $this->key = $this->createApiKey($user, $permissions);

        $this->withHeader('Authorization', 'Bearer ' . $this->key->identifier . decrypt($this->key->token));

        return $this->key;
    }

    /**
     * Create an administrative user.
     */
    protected function createApiUser(): User
    {
        return User::factory()->create([
            'root_admin' => true,
        ]);
    }

    /**
     * Create a new application API key for a given user model.
     */
    protected function createApiKey(User $user, array $permissions = []): ApiKey
    {
        return ApiKey::factory()->create(array_merge([
            'user_id' => $user->id,
            'key_type' => ApiKey::TYPE_APPLICATION,
            'r_servers' => AdminAcl::READ | AdminAcl::WRITE,
            'r_nodes' => AdminAcl::READ | AdminAcl::WRITE,
            'r_allocations' => AdminAcl::READ | AdminAcl::WRITE,
            'r_users' => AdminAcl::READ | AdminAcl::WRITE,
            'r_locations' => AdminAcl::READ | AdminAcl::WRITE,
            'r_nests' => AdminAcl::READ | AdminAcl::WRITE,
            'r_eggs' => AdminAcl::READ | AdminAcl::WRITE,
            'r_database_hosts' => AdminAcl::READ | AdminAcl::WRITE,
            'r_server_databases' => AdminAcl::READ | AdminAcl::WRITE,
        ], $permissions));
    }

    /**
     * Return a transformer that can be used for testing purposes.
     */
    protected function getTransformer(string $abstract): BaseTransformer
    {
        $request = Request::createFromGlobals();
        $request->setUserResolver(function () {
            return $this->getApiKey()->user;
        });

        $transformer = $abstract::fromRequest($request);

        Assert::assertInstanceOf(BaseTransformer::class, $transformer);
        Assert::assertNotInstanceOf(BaseClientTransformer::class, $transformer);

        return $transformer;
    }
}

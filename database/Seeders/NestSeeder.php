<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use SparkPanel\Services\Nests\NestCreationService;
use SparkPanel\Contracts\Repository\NestRepositoryInterface;

class NestSeeder extends Seeder
{
    /**
     * @var NestCreationService
     */
    private $creationService;

    /**
     * @var NestRepositoryInterface
     */
    private $repository;

    /**
     * NestSeeder constructor.
     */
    public function __construct(
        NestCreationService $creationService,
        NestRepositoryInterface $repository,
    ) {
        $this->creationService = $creationService;
        $this->repository = $repository;
    }

    /**
     * Run the seeder to add missing nests to the Panel.
     *
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     */
    public function run()
    {
        $items = $this->repository->findWhere([
            'author' => 'support@SparkPanel.io',
        ])->keyBy('name')->toArray();

        $this->createMinecraftNest(array_get($items, 'Minecraft'));
        $this->createSourceEngineNest(array_get($items, 'Source Engine'));
        $this->createVoiceServersNest(array_get($items, 'Voice Servers'));
        $this->createRustNest(array_get($items, 'Rust'));
    }

    /**
     * Create the Minecraft nest to be used later on.
     *
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     */
    private function createMinecraftNest(?array $nest = null)
    {
        if (is_null($nest)) {
            $this->creationService->handle([
                'name' => 'Minecraft',
                'description' => 'Minecraft - the classic game from Mojang. With support for Vanilla MC, Spigot, and many others!',
            ], 'support@SparkPanel.io');
        }
    }

    /**
     * Create the Source Engine Games nest to be used later on.
     *
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     */
    private function createSourceEngineNest(?array $nest = null)
    {
        if (is_null($nest)) {
            $this->creationService->handle([
                'name' => 'Source Engine',
                'description' => 'Includes support for most Source Dedicated Server games.',
            ], 'support@SparkPanel.io');
        }
    }

    /**
     * Create the Voice Servers nest to be used later on.
     *
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     */
    private function createVoiceServersNest(?array $nest = null)
    {
        if (is_null($nest)) {
            $this->creationService->handle([
                'name' => 'Voice Servers',
                'description' => 'Voice servers such as Mumble and Teamspeak 3.',
            ], 'support@SparkPanel.io');
        }
    }

    /**
     * Create the Rust nest to be used later on.
     *
     * @throws \SparkPanel\Exceptions\Model\DataValidationException
     */
    private function createRustNest(?array $nest = null)
    {
        if (is_null($nest)) {
            $this->creationService->handle([
                'name' => 'Rust',
                'description' => 'Rust - A game where you must fight to survive.',
            ], 'support@SparkPanel.io');
        }
    }
}

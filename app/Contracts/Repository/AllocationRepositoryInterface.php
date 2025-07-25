<?php

namespace SparkPanel\Contracts\Repository;

use SparkPanel\Models\Allocation;

interface AllocationRepositoryInterface extends RepositoryInterface
{
    /**
     * Return all the allocations that exist for a node that are not currently
     * allocated.
     */
    public function getUnassignedAllocationIds(int $node): array;

    /**
     * Return a single allocation from those meeting the requirements.
     */
    public function getRandomAllocation(array $nodes, array $ports, bool $dedicated = false): ?Allocation;
}

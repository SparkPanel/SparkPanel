<?php

namespace SparkPanel\Tests\Unit\Http\Middleware;

use SparkPanel\Tests\TestCase;
use SparkPanel\Tests\Traits\Http\RequestMockHelpers;
use SparkPanel\Tests\Traits\Http\MocksMiddlewareClosure;
use SparkPanel\Tests\Assertions\MiddlewareAttributeAssertionsTrait;

abstract class MiddlewareTestCase extends TestCase
{
    use MiddlewareAttributeAssertionsTrait;
    use MocksMiddlewareClosure;
    use RequestMockHelpers;

    /**
     * Setup tests with a mocked request object and normal attributes.
     */
    public function setUp(): void
    {
        parent::setUp();

        $this->buildRequestMock();
    }
}

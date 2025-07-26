<?php

namespace SparkPanel\Exceptions\Service;

use Illuminate\Http\Response;
use SparkPanel\Exceptions\DisplayException;

class HasActiveServersException extends DisplayException
{
    public function getStatusCode(): int
    {
        return Response::HTTP_BAD_REQUEST;
    }
}

<?php

namespace SparkPanel\Exceptions;

use Illuminate\Foundation\Exception\Handler as ExceptionHandler;
use Throwable;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpException;

class Handler extends ExceptionHandler
{
    /**
     * A list of the exception types that are not reported.
     *
     * @var array
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed for validation exceptions.
     *
     * @var array
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     *
     * @return void
     */
    public function register()
    {
        $this->reportable(function (Throwable $throwable) {
            // Log all exceptions
            Log::error('Exception occurred: ' . $throwable->getMessage(), [
                'exception' => $throwable,
            ]);
        });

        $this->renderable(function (HttpException $e, $request) {
            return response()->json([
                'error' => [
                    'code' => $e->getStatusCode(),
                    'message' => $e->getMessage(),
                    'exception' => get_class($e),
                ],
            ], $e->getStatusCode());
        });

        $this->renderable(function (\Exception $e, $request) {
            // Handle all other exceptions
            return response()->json([
                'error' => [
                    'code' => 500,
                    'message' => 'An unexpected error occurred.',
                    'exception' => get_class($e),
                ],
            ], 500);
        });
    }
}

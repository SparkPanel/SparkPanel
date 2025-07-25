<?php

namespace SparkPanel\Http\Middleware\Activity;

use Illuminate\Http\Request;
use SparkPanel\Models\ApiKey;
use SparkPanel\Facades\LogTarget;

class TrackAPIKey
{
    /**
     * Determines if the authenticated user making this request is using an actual
     * API key, or it is just a cookie authenticated session. This data is set in a
     * request singleton so that all tracked activity log events are properly associated
     * with the given API key.
     */
    public function handle(Request $request, \Closure $next): mixed
    {
        if ($request->user()) {
            $token = $request->user()->currentAccessToken();

            LogTarget::setApiKeyId($token instanceof ApiKey ? $token->id : null);
        }

        return $next($request);
    }
}

<?php

namespace SparkPanel\Http\Requests\Api\Client\Servers\Files;

use SparkPanel\Models\Permission;
use SparkPanel\Contracts\Http\ClientPermissionsRequest;
use SparkPanel\Http\Requests\Api\Client\ClientApiRequest;

class ChmodFilesRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_UPDATE;
    }

    public function rules(): array
    {
        return [
            'root' => 'required|nullable|string',
            'files' => 'required|array',
            'files.*.file' => 'required|string',
            'files.*.mode' => 'required|numeric',
        ];
    }
}

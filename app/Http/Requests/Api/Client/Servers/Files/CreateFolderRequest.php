<?php

namespace SparkPanel\Http\Requests\Api\Client\Servers\Files;

use SparkPanel\Models\Permission;
use SparkPanel\Http\Requests\Api\Client\ClientApiRequest;

class CreateFolderRequest extends ClientApiRequest
{
    /**
     * Checks that the authenticated user is allowed to create files on the server.
     */
    public function permission(): string
    {
        return Permission::ACTION_FILE_CREATE;
    }

    public function rules(): array
    {
        return [
            'root' => 'sometimes|nullable|string',
            'name' => 'required|string',
        ];
    }
}

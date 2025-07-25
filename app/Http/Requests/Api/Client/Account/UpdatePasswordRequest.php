<?php

namespace SparkPanel\Http\Requests\Api\Client\Account;

use Illuminate\Container\Container;
use Illuminate\Contracts\Hashing\Hasher;
use SparkPanel\Http\Requests\Api\Client\ClientApiRequest;
use SparkPanel\Exceptions\Http\Base\InvalidPasswordProvidedException;

class UpdatePasswordRequest extends ClientApiRequest
{
    /**
     * @throws InvalidPasswordProvidedException
     */
    public function authorize(): bool
    {
        if (!parent::authorize()) {
            return false;
        }

        $hasher = Container::getInstance()->make(Hasher::class);

        // Verify password matches when changing password or email.
        if (!$hasher->check($this->input('current_password'), $this->user()->password)) {
            throw new InvalidPasswordProvidedException(trans('validation.internal.invalid_password'));
        }

        return true;
    }

    public function rules(): array
    {
        return [
            'password' => ['required', 'string', 'confirmed', 'min:8'],
        ];
    }
}

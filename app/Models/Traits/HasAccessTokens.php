<?php

namespace SparkPanel\Models\Traits;

use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use SparkPanel\Models\ApiKey;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\HasMany;
use SparkPanel\Extensions\Laravel\Sanctum\NewAccessToken;

/**
 * @mixin \SparkPanel\Models\Model
 */
trait HasAccessTokens
{
    use HasApiTokens {
        tokens as private _tokens;
        createToken as private _createToken;
    }

    public function tokens(): HasMany
    {
        return $this->hasMany(Sanctum::$personalAccessTokenModel);
    }

    public function createToken(?string $memo, ?array $ips): NewAccessToken
    {
        /** @var ApiKey $token */
        $token = $this->tokens()->forceCreate([
            'user_id' => $this->id,
            'key_type' => ApiKey::TYPE_ACCOUNT,
            'identifier' => ApiKey::generateTokenIdentifier(ApiKey::TYPE_ACCOUNT),
            'token' => encrypt($plain = Str::random(ApiKey::KEY_LENGTH)),
            'memo' => $memo ?? '',
            'allowed_ips' => $ips ?? [],
        ]);

        return new NewAccessToken($token, $plain);
    }
}

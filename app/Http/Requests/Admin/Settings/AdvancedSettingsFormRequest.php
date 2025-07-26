<?php

namespace SparkPanel\Http\Requests\Admin\Settings;

use SparkPanel\Http\Requests\Admin\AdminFormRequest;

class AdvancedSettingsFormRequest extends AdminFormRequest
{
    /**
     * Return all the rules to apply to this request's data.
     */
    public function rules(): array
    {
        return [
            'recaptcha:enabled' => 'required|in:true,false',
            'recaptcha:secret_key' => 'required|string|max:191',
            'recaptcha:website_key' => 'required|string|max:191',
            'SparkPanel:guzzle:timeout' => 'required|integer|between:1,60',
            'SparkPanel:guzzle:connect_timeout' => 'required|integer|between:1,60',
            'SparkPanel:client_features:allocations:enabled' => 'required|in:true,false',
            'SparkPanel:client_features:allocations:range_start' => [
                'nullable',
                'required_if:SparkPanel:client_features:allocations:enabled,true',
                'integer',
                'between:1024,65535',
            ],
            'SparkPanel:client_features:allocations:range_end' => [
                'nullable',
                'required_if:SparkPanel:client_features:allocations:enabled,true',
                'integer',
                'between:1024,65535',
                'gt:SparkPanel:client_features:allocations:range_start',
            ],
        ];
    }

    public function attributes(): array
    {
        return [
            'recaptcha:enabled' => 'reCAPTCHA Enabled',
            'recaptcha:secret_key' => 'reCAPTCHA Secret Key',
            'recaptcha:website_key' => 'reCAPTCHA Website Key',
            'SparkPanel:guzzle:timeout' => 'HTTP Request Timeout',
            'SparkPanel:guzzle:connect_timeout' => 'HTTP Connection Timeout',
            'SparkPanel:client_features:allocations:enabled' => 'Auto Create Allocations Enabled',
            'SparkPanel:client_features:allocations:range_start' => 'Starting Port',
            'SparkPanel:client_features:allocations:range_end' => 'Ending Port',
        ];
    }
}

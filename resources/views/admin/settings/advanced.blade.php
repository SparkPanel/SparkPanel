@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'advanced'])

@section('title')
    Advanced Settings
@endsection

@section('content-header')
    <h1>Advanced Settings<small>Configure advanced settings for SparkPanel.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <div class="row">
        <div class="col-xs-12">
            <form action="" method="POST">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">reCAPTCHA</h3>
                    </div>
                    <div class="box-body">
                        <div class="row">
                            <div class="form-group col-md-4">
                                <label class="control-label">Status</label>
                                <div>
                                    <select class="form-control" name="recaptcha:enabled">
                                        <option value="true">Enabled</option>
                                        <option value="false" @if(old('recaptcha:enabled', config('recaptcha.enabled')) == '0') selected @endif>Disabled</option>
                                    </select>
                                    <p class="text-muted small">If enabled, login forms and password reset forms will do a silent captcha check and display a visible captcha if needed.</p>
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label class="control-label">Site Key</label>
                                <div>
                                    <input type="text" required class="form-control" name="recaptcha:website_key" value="{{ old('recaptcha:website_key', config('recaptcha.website_key')) }}">
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label class="control-label">Secret Key</label>
                                <div>
                                    <input type="text" required class="form-control" name="recaptcha:secret_key" value="{{ old('recaptcha:secret_key', config('recaptcha.secret_key')) }}">
                                    <p class="text-muted small">Used for communication between your site and Google. Be sure to keep it a secret.</p>
                                </div>
                            </div>
                        </div>
                        @if($showRecaptchaWarning)
                            <div class="row">
                                <div class="col-xs-12">
                                    <div class="alert alert-warning no-margin">
                                        You are currently using reCAPTCHA keys that were shipped with this Panel. For improved security it is recommended to <a href="https://www.google.com/recaptcha/admin">generate new invisible reCAPTCHA keys</a> that tied specifically to your website.
                                    </div>
                                </div>
                            </div>
                        @endif
                    </div>
                </div>
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">HTTP Connections</h3>
                    </div>
                    <div class="box-body">
                        <div class="row">
                            <div class="form-group col-md-6">
                                <label class="control-label">Connection Timeout</label>
                                <div>
                                    <input type="number" required class="form-control" name="SparkPanel:guzzle:connect_timeout" value="{{ old('SparkPanel:guzzle:connect_timeout', config('SparkPanel.guzzle.connect_timeout')) }}">
                                    <p class="text-muted small">The amount of time in seconds to wait for a connection to be opened before throwing an error.</p>
                                </div>
                            </div>
                            <div class="form-group col-md-6">
                                <label class="control-label">Request Timeout</label>
                                <div>
                                    <input type="number" required class="form-control" name="SparkPanel:guzzle:timeout" value="{{ old('SparkPanel:guzzle:timeout', config('SparkPanel.guzzle.timeout')) }}">
                                    <p class="text-muted small">The amount of time in seconds to wait for a request to be completed before throwing an error.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Automatic Allocation Creation</h3>
                    </div>
                    <div class="box-body">
                        <div class="row">
                            <div class="form-group col-md-4">
                                <label class="control-label">Status</label>
                                <div>
                                    <select class="form-control" name="SparkPanel:client_features:allocations:enabled">
                                        <option value="false">Disabled</option>
                                        <option value="true" @if(old('SparkPanel:client_features:allocations:enabled', config('SparkPanel.client_features.allocations.enabled'))) selected @endif>Enabled</option>
                                    </select>
                                    <p class="text-muted small">If enabled users will have the option to automatically create new allocations for their server via the frontend.</p>
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label class="control-label">Starting Port</label>
                                <div>
                                    <input type="number" class="form-control" name="SparkPanel:client_features:allocations:range_start" value="{{ old('SparkPanel:client_features:allocations:range_start', config('SparkPanel.client_features.allocations.range_start')) }}">
                                    <p class="text-muted small">The starting port in the range that can be automatically allocated.</p>
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label class="control-label">Ending Port</label>
                                <div>
                                    <input type="number" class="form-control" name="SparkPanel:client_features:allocations:range_end" value="{{ old('SparkPanel:client_features:allocations:range_end', config('SparkPanel.client_features.allocations.range_end')) }}">
                                    <p class="text-muted small">The ending port in the range that can be automatically allocated.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="box box-primary">
                    <div class="box-footer">
                        {{ csrf_field() }}
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
@endsection

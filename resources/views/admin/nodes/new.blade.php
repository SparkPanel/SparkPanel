@extends('layouts.admin')

@section('title')
    Nodes &rarr; New
@endsection

@section('content-header')
    <h1>New Node<small>Create a new local or remote node for servers to be installed to.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.nodes') }}">Nodes</a></li>
        <li class="active">New</li>
    </ol>
@endsection

@section('content')
<form action="{{ route('admin.nodes.new') }}" method="POST">
    <div class="row">
        <div class="col-sm-6">
            <div class="box box-primary">
                <div class="box-header with-border">
                    <h3 class="box-title">Basic Information</h3>
                </div>
                <div class="box-body">
                    <div class="form-group">
                        <label for="name" class="control-label">Name</label>
                        <div>
                            <input type="text" name="name" class="form-control" id="name" value="{{ old('name') }}" />
                        </div>
                        <p class="text-muted small mt-1">Character limits: <code>a-zA-Z0-9_.-</code> and <code>[Space]</code> (min 1, max 100 characters).</p>
                    </div>
                    <div class="form-group">
                        <label for="location_id" class="control-label">Location</label>
                        <div>
                            <select name="location_id" id="pLocationId" class="form-control">
                                @foreach($locations as $location)
                                    <option value="{{ $location->id }}" {{ (old('location_id') == $location->id) ? 'selected' : '' }}>{{ $location->long }} ({{ $location->short }})</option>
                                @endforeach
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="public" class="control-label">Allow Automatic Allocation</label>
                        <div>
                            <input type="checkbox" name="public" value="1" {{ (old('public', 1)) ? 'checked' : '' }} id="public_1">
                            <label for="public_1">Yes</label>
                        </div>
                        <p class="text-muted small mt-1">Allow automatic allocation to this Node?</p>
                    </div>
                    <div class="form-group">
                        <label for="fqdn" class="control-label">FQDN or IP Address</label>
                        <input type="text" name="fqdn" id="pFQDN" class="form-control" value="{{ old('fqdn') }}"/>
                        <p class="text-muted small mt-1">
                            Enter a domain name (e.g <code>node.example.com</code>) or IP address to be used for connecting to the daemon.
                            <strong>If using an IP address, ensure you are not using SSL for this node.</strong>
                        </p>
                    </div>
                    <div class="form-group">
                        <label class="control-label">Communicate Over SSL</label>
                        <div>
                            <div class="radio radio-success radio-inline">
                                <input type="radio" id="pSSLTrue" value="https" name="scheme" checked>
                                <label for="pSSLTrue"> Use SSL Connection</label>
                            </div>
                            <div class="radio radio-danger radio-inline">
                                <input type="radio" id="pSSLFalse" value="http" name="scheme" @if(request()->isSecure()) disabled @endif>
                                <label for="pSSLFalse"> Use HTTP Connection</label>
                            </div>
                        </div>
                        @if(request()->isSecure())
                            <p class="text-danger small mt-1">Your Panel is currently configured to use a secure connection. In order for browsers to connect to your node it <strong>must</strong> use a SSL connection.</p>
                        @else
                            <p class="text-muted small mt-1">In most cases you should select to use a SSL connection. If using an IP Address or you do not wish to use SSL at all, select a HTTP connection.</p>
                        @endif
                    </div>
                    <div class="form-group">
                        <label class="control-label">Behind Proxy</label>
                        <div>
                            <div class="radio radio-success radio-inline">
                                <input type="radio" id="pProxyFalse" value="0" name="behind_proxy" checked>
                                <label for="pProxyFalse"> Not Behind Proxy </label>
                            </div>
                            <div class="radio radio-info radio-inline">
                                <input type="radio" id="pProxyTrue" value="1" name="behind_proxy">
                                <label for="pProxyTrue"> Behind Proxy </label>
                            </div>
                        </div>
                        <p class="text-muted small mt-1">If you are running the daemon behind a proxy such as Cloudflare, select this to have the daemon skip looking for certificates on boot.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-sm-6">
            <div class="box box-primary">
                <div class="box-header with-border">
                    <h3 class="box-title">Configuration</h3>
                </div>
                <div class="box-body">
                    <div class="row">
                        <div class="form-group col-md-6">
                            <label for="daemonBase" class="form-label">Daemon Server File Directory</label>
                            <input type="text" name="daemonBase" id="pDaemonBase" class="form-control" value="/var/lib/SparkPanel/volumes" />
                            <p class="text-muted small mt-1">
                                Enter the directory where server files should be stored.
                                <strong>If you use OVH you should check your partition scheme. You may need to use <code>/home/daemon-data</code> to have enough space.</strong>
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="memory" class="form-label">Total Memory</label>
                            <div class="input-group">
                                <input type="text" name="memory" data-multiplicator="true" class="form-control" id="pMemory" value="{{ old('memory') }}"/>
                                <span class="input-group-addon">MiB</span>
                            </div>
                            <p class="text-muted small mt-1">
                                Enter the total amount of memory available for new servers.
                                <strong>Do not include units</strong> - just enter a number.
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="memory_overallocate" class="form-label">Memory Over-Allocation</label>
                            <div class="input-group">
                                <input type="text" name="memory_overallocate" class="form-control" id="pMemoryOverallocate" value="{{ old('memory_overallocate') }}"/>
                                <span class="input-group-addon">%</span>
                            </div>
                            <p class="text-muted small mt-1">
                                Enter the percentage of memory over-allocation allowed.
                                <code>-1</code> will disable checking and <code>0</code> will prevent creating new servers if it would put the node over the limit.
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="disk" class="form-label">Total Disk Space</label>
                            <div class="input-group">
                                <input type="text" name="disk" data-multiplicator="true" class="form-control" id="pDisk" value="{{ old('disk') }}"/>
                                <span class="input-group-addon">MiB</span>
                            </div>
                            <p class="text-muted small mt-1">
                                Enter the total amount of disk space available for new servers.
                                <strong>Do not include units</strong> - just enter a number.
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="disk_overallocate" class="form-label">Disk Over-Allocation</label>
                            <div class="input-group">
                                <input type="text" name="disk_overallocate" class="form-control" id="pDiskOverallocate" value="{{ old('disk_overallocate') }}"/>
                                <span class="input-group-addon">%</span>
                            </div>
                            <p class="text-muted small mt-1">
                                Enter the percentage of disk space over-allocation allowed.
                                <code>-1</code> will disable checking and <code>0</code> will prevent creating new servers if it would put the node over the limit.
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="daemonListen" class="form-label">Daemon Listening Port</label>
                            <input type="text" name="daemonListen" class="form-control" id="pDaemonListen" value="8080" />
                            <p class="text-muted small mt-1">
                                Enter the port that Wings should listen on for API requests.
                                <strong>Make sure this port is open in your firewall.</strong>
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="daemonSFTP" class="form-label">Daemon SFTP Port</label>
                            <input type="text" name="daemonSFTP" class="form-control" id="pDaemonSFTP" value="2022" />
                            <p class="text-muted small mt-1">
                                Enter the port that Wings should listen on for SFTP connections.
                                <strong>Ensure this port is open in your firewall and not conflicting with system SSH service.</strong>
                            </p>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="upload_size" class="form-label">Maximum Upload Size</label>
                            <div class="input-group">
                                <input type="text" name="upload_size" class="form-control" id="pUploadSize" value="{{ old('upload_size') }}"/>
                                <span class="input-group-addon">MiB</span>
                            </div>
                            <p class="text-muted small mt-1">
                                Enter the maximum filesize for web uploads (e.g., file manager).
                                <code>100</code> is recommended minimum for most servers.
                            </p>
                        </div>
                    </div>
                </div>
                <div class="box-footer">
                    {!! csrf_field() !!}
                    <button type="submit" class="btn btn-success pull-right">Create Node</button>
                </div>
            </div>
        </div>
    </div>
</form>
@endsection

@section('footer-scripts')
    @parent
    <script>
        $('#pLocationId').select2();
    </script>
@endsection

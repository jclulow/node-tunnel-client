/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_url = require('url');
var mod_http = require('http');

var mod_assert = require('assert-plus');
var mod_verror = require('verror');

var VError = mod_verror.VError;

function
TunnelClient(options)
{
	var self = this;

	if (options.proxy_url) {
		mod_assert.string(options.proxy_url, 'options.proxy_url');
		var proxy_url = mod_url.parse(options.proxy_url);
		mod_assert.strictEqual(proxy_url.protocol, 'http:',
		    'unsupported proxy protocol');

		self.hpt_proxy_host = proxy_url.hostname;
		self.hpt_proxy_port = Number(proxy_url.port || 3128);
		self.hpt_proxy_auth = proxy_url.auth;
	} else {
		mod_assert.string(options.proxy_host, 'options.proxy_host');
		mod_assert.number(options.proxy_port, 'options.proxy_port');
		mod_assert.optionalString(options.proxy_username,
		    'options.proxy_username');
		mod_assert.optionalString(options.proxy_password,
		    'options.proxy_password');

		self.hpt_proxy_host = options.proxy_host;
		self.hpt_proxy_port = options.proxy_port;
		if (options.proxy_username) {
			self.hpt_proxy_auth = options.proxy_username + ':' +
			     (options.proxy_password || '');
		}
	}

	/*
	 * At present, we only support a simple HTTP CONNECT-style
	 * tunneling proxy.
	 */
	self.connect = http_tunnel_connect;

	self.hpt_stats = {
		hpts_ok: 0,
		hpts_fail: 0
	};
}

TunnelClient.prototype.connect = function
connect()
{
	throw (new VError('run constructor'));
};

function
http_tunnel_connect(host, port, callback)
{
	var self = this;

	mod_assert.string(host, 'host');
	mod_assert.number(port, 'port');
	mod_assert.func(callback, 'callback');

	var done = false;

	var req_opts = {
		host: self.hpt_proxy_host,
		port: self.hpt_proxy_port,
		auth: self.hpt_proxy_auth,
		method: 'CONNECT',
		path: host + ':' + port,
		agent: false,
	};

	var req = mod_http.request(req_opts);

	req.on('error', function (err) {
		if (done)
			return;
		done = true;

		var _err = new VError(err, 'error while connecting to proxy');

		req.removeAllListeners();
		self.hpt_stats.hpts_fail++;
		callback(_err);
	});

	req.on('response', function (res) {
		if (done)
			return;
		done = true;

		/*
		 * Discard response body.
		 */
		res.resume();

		var err = new VError('server did not allow CONNECT (HTTP %d)',
		    res.statusCode);
		err.statusCode = res.statusCode;
		err.subresponse = res;

		req.removeAllListeners();

		self.hpt_stats.hpts_fail++;
		callback(err);
	});

	req.on('connect', function (res, socket, head) {
		if (done)
			return;
		done = true;

		if (res.statusCode === 200) {
			/*
			 * Return the parsing overrun to the stream:
			 */
			socket.unshift(head);

			req.removeAllListeners();
			self.hpt_stats.hpts_ok++;
			callback(null, socket);
			return;
		}

		var err = new Error('server did not allow CONNECT (HTTP %d)',
		    res.statusCode);
		err.statusCode = res.statusCode;
		err.subresponse = res;
		socket.destroy();
		callback(err);
	});

	req.end();
}

module.exports = {
	TunnelClient: TunnelClient
};

/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_http = require('http');

var mod_assert = require('assert-plus');

function
TunnelClient(options)
{
	var self = this;

	mod_assert.string(options.proxy_host, 'options.proxy_host');
	mod_assert.number(options.proxy_port, 'options.proxy_port');

	self.hpt_proxy_host = options.proxy_host;
	self.hpt_proxy_port = options.proxy_port;

	self.hpt_stats = {
		hpts_ok: 0,
		hpts_fail: 0
	};
}

TunnelClient.prototype.connect = function
connect(host, port, callback)
{
	var self = this;

	mod_assert.string(host, 'host');
	mod_assert.object(port, 'port');
	mod_assert.func(callback, 'callback');

	var done = false;

	var req_opts = {
		host: self.hpt_proxy_host,
		port: self.hpt_proxy_port,
		method: 'CONNECT',
		path: host + ':' + port,
		agent: false
	};

	var req = mod_http.request(req_opts);

	req.on('error', function (err) {
		if (done)
			return;
		done = true;

		req.removeAllListeners();
		self.hpt_stats.hpts_fail++;
		callback(err);
	});

	req.on('response', function (res) {
		if (done)
			return;
		done = true;

		var err = new Error('server did not allow CONNECT (HTTP ' +
		    res.statusCode + ')');
		err.statusCode = res.statusCode;

		req.removeAllListeners();
		self.hpt_stats.hpts_fail++;
		callback(err);
	});

	req.on('connect', function (res, socket, head) {
		if (done)
			return;
		done = true;

		if (res.statusCode !== 200) {
			var err = new Error('server did not allow CONNECT ' +
			    '(HTTP ' + res.statusCode + ')');
			err.statusCode = res.statusCode;
			socket.destroy();
			callback(err);
			return;
		}

		/*
		 * Return the parsing overrun to the stream:
		 */
		socket.unshift(head);

		req.removeAllListeners();
		self.hpt_stats.hpts_ok++;
		callback(null, socket);
	});

	req.end();
};

module.exports = {
	TunnelClient: TunnelClient
};

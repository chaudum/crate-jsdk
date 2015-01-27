/**
 * crate-jsdk
 * A pure Javascript Development Kit for Crate
 *
 * Copyright 2015 Crate.IO
 * Apache License v2.0
 *
 * https://crate.io
 * https://github.com/chaudum/crate-jsdk
 *
 */

;(function(Q, Client){

  if (!String.prototype.trim) {
    String.prototype.trim = function(){
      return this.replace(/^\s+|\s+$/g,'');
    };
  }
  var default_host = '127.0.0.1:4200';
  var hosts = [
      'https://st1.p.fir.io:4200',
      'https://st2.p.fir.io:4200'
  ];

  Q.test("round robin", function(assert) {
    var cr = Client.connect(hosts);
    assert.equal(cr._active_hosts, hosts);
    // first host
    assert.equal(cr.getNextHost(), hosts[0]);
    // second host
    assert.equal(cr.getNextHost(), hosts[1]);
    // first host again
    assert.equal(cr.getNextHost(), hosts[0]);
  });

  Q.test("no servers", function(assert) {
    var cr = Client.connect(hosts);
    cr._active_hosts = [];
    assert.equal(cr.getNextHost(), null);
  });

  Q.test("empty server list", function(assert) {
    assert.throws(function(){
      var cr = Client.connect([]);
    }, Client.NO_MORE_SERVERS, Client.NO_MORE_SERVERS.message);
  });

  Q.test("undefined server list", function(assert) {
    var cr = Client.connect();
    assert.equal(cr._active_hosts, default_host);
  });

  Q.test("class instantiation", function(assert) {
    var cr = new Client();
    assert.equal(cr._active_hosts, default_host);
    cr = new Client(hosts);
    assert.equal(cr._active_hosts, hosts);
  });

  Q.test("query instance", function(assert) {
    var q = new Query();
    assert.equal(q._sql, '/_sql');
    assert.equal(q._host, default_host);
    assert.equal(q.getURI(), 'http://127.0.0.1:4200/_sql');
  });

  Q.test("execute query", function(assert){
    var q = new Query(['127.0.0.1:44200']);
    var promise = q.execute('select name from sys.cluster;');
    assert.equal(typeof promise.then, 'function');
    assert.equal(typeof promise.catch, 'function');
  });

  Q.test("execute", function(assert){
    var cr = new Client(['127.0.0.1:44200']);
    var p = cr.execute('select * from sys.cluster');
    var cl = new Cluster('127.0.0.1:44200');
    assert.equal(cl._cluster, null);
    cl.fetch();
  });

}(QUnit, Client));

